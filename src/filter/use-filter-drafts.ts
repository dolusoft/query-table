import { onScopeDispose, reactive, watch } from 'vue'

import type {
  Column,
  FilterCondition,
  FilterRule,
  QueryChangeReason,
  TableQuery
} from '../contract'
import { defaultConditionFor } from './filter-conditions'
import {
  type Draft,
  draftFromRules,
  hasContent,
  parseDraft
} from './filter-draft'
import { previewCondition } from './filter-input-parser'
import { columnTypeOf } from '../core/column'
import { cloneQuery, replaceRules, rulesOf, sameRules } from '../core/query'

export interface FilterDraftsOptions {
  /** The query the table currently shows. */
  query: () => TableQuery
  /** The query a new update must build on (includes updates not yet echoed). */
  base: () => TableQuery
  columns: () => Column[]
  debounce: () => number
  update: (next: TableQuery, reason: QueryChangeReason) => void
}

const blank: Readonly<Draft> = Object.freeze({ text: '', condition: null })

/**
 * How many emitted rule sets per field are remembered for the echo check
 * (C-18). An answer to an older emit than this is treated as an outside
 * change.
 */
const emittedLimit = 8

export const useFilterDrafts = (options: FilterDraftsOptions) => {
  const drafts = reactive<Record<string, Draft>>({})
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  // Rules per field as of the last reconciliation: a field is only
  // reconciled when its rules really changed.
  const seen = new Map<string, FilterRule[]>()
  // Rules this table emitted per field that have not come back yet, oldest
  // first, the last `emittedLimit` of them. A consumer that answers late
  // returns them in order; they are the table's own words, not an outside
  // change, and must not touch the draft.
  const emitted = new Map<string, FilterRule[][]>()

  const columnOf = (field: string) =>
    options.columns().find(column => column.field === field)

  const draftOf = (field: string): Readonly<Draft> => drafts[field] ?? blank

  const ensure = (field: string): Draft => {
    drafts[field] ??= { text: '', condition: null }
    return drafts[field]
  }

  const cancel = (field: string) => {
    const timer = timers.get(field)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(field)
    }
  }

  /** Applies the draft of `field` to the query. */
  const commit = (field: string): boolean => {
    cancel(field)
    const column = columnOf(field)
    if (!column) {
      return false
    }
    const base = options.base()
    const rules: FilterRule[] = parseDraft(column, draftOf(field)).map(
      rule => ({ field, condition: rule.condition, value: rule.value })
    )
    if (sameRules(rulesOf(base.filters, field), rules)) {
      return false
    }
    const next = cloneQuery(base)
    next.page = 1
    next.filters = replaceRules(base.filters, field, rules)
    emitted.set(
      field,
      [...(emitted.get(field) ?? []), rules].slice(-emittedLimit)
    )
    options.update(next, 'filter')
    return true
  }

  const schedule = (field: string) => {
    cancel(field)
    const wait = options.debounce()
    if (wait <= 0 || draftOf(field).text.trim() === '') {
      commit(field)
      return
    }
    timers.set(
      field,
      setTimeout(() => commit(field), wait)
    )
  }

  const onInput = (field: string, text: string) => {
    const draft = ensure(field)
    draft.text = text
    draft.multi = undefined
    schedule(field)
  }

  const flushField = (field: string) => {
    if (timers.has(field)) {
      commit(field)
    }
  }

  /** Applies every pending draft; `true` when any of them changed the filters. */
  const flushAll = (): boolean => {
    let changed = false
    for (const field of [...timers.keys()]) {
      changed = commit(field) || changed
    }
    return changed
  }

  const setCondition = (field: string, condition: FilterCondition | null) => {
    if (condition === null) {
      clear(field)
      return
    }
    const draft = ensure(field)
    if (draft.multi) {
      // Picking a condition is an explicit edit: the first rule's value
      // carries over, the other rules go.
      const first = rulesOf(options.base().filters, field)[0]
      draft.text = first ? String(first.value) : ''
      draft.multi = undefined
    }
    draft.condition = condition
    commit(field)
  }

  function clear(field: string) {
    cancel(field)
    drafts[field] = { text: '', condition: null }
    commit(field)
  }

  const clearAll = () => {
    for (const field of Object.keys(drafts)) {
      cancel(field)
      drafts[field] = { text: '', condition: null }
    }
    const base = options.base()
    if (base.filters.length > 0) {
      const next = cloneQuery(base)
      next.page = 1
      next.filters = []
      options.update(next, 'reset')
    }
  }

  /** Drops what is kept for a column that is no longer in `columns`. */
  const forget = (field: string) => {
    cancel(field)
    delete drafts[field]
    seen.delete(field)
    emitted.delete(field)
  }

  /** Brings drafts in line with rules that changed from outside. */
  const reconcile = () => {
    const { filters } = options.query()
    const present = new Set(options.columns().map(column => column.field))
    // A column that went takes its typed text with it, so Clear all does not
    // stay enabled for text nobody can see (C-22).
    const kept = new Set([
      ...Object.keys(drafts),
      ...seen.keys(),
      ...emitted.keys()
    ])
    for (const field of kept) {
      if (!present.has(field)) {
        forget(field)
      }
    }
    for (const column of options.columns()) {
      const { field } = column
      const rules = rulesOf(filters, field)
      if (sameRules(rules, seen.get(field) ?? [])) {
        continue
      }
      seen.set(field, rules)
      const pending = emitted.get(field) ?? []
      const echo = pending.findIndex(sent => sameRules(sent, rules))
      if (echo >= 0) {
        // Our own emit came back (possibly late): older ones are answered
        // too, newer ones are still on their way. The draft stays as typed.
        emitted.set(field, pending.slice(echo + 1))
        continue
      }
      // A different set of rules: the consumer has moved on from what we sent.
      emitted.delete(field)
      const draft = drafts[field]
      if (
        draft &&
        sameRules(
          parseDraft(column, draft).map(r => ({ ...r, field })),
          rules
        )
      ) {
        continue
      }
      if (!draft && rules.length === 0) {
        continue
      }
      cancel(field)
      drafts[field] = draftFromRules(column, rules)
    }
  }

  watch([() => options.query().filters, options.columns], reconcile, {
    immediate: true,
    deep: true
  })

  onScopeDispose(() => timers.forEach(timer => clearTimeout(timer)))

  /** Condition label under the input, with a count for several rules. */
  const label = (
    column: Column
  ): { condition: FilterCondition; count: number } | null => {
    const draft = draftOf(column.field)
    if (!hasContent(draft)) {
      return null
    }
    const type = columnTypeOf(column)
    const base = draft.condition ?? defaultConditionFor(type)
    const condition =
      type === 'string' ? previewCondition(draft.text, base) : base
    return { condition, count: draft.multi ?? parseDraft(column, draft).length }
  }

  /** How many rules a read-only input stands for; `0` when it is editable. */
  const multiOf = (field: string) => draftOf(field).multi ?? 0

  /** Text or a condition is waiting in the input of a column that exists. */
  const dirty = () =>
    options.columns().some(column => hasContent(draftOf(column.field)))

  /** Clear all has something to do: a rule in `query` or typed text (C-22). */
  const canClearAll = () => options.query().filters.length > 0 || dirty()

  return {
    canClearAll,
    draftOf,
    onInput,
    flushField,
    flushAll,
    setCondition,
    clear,
    clearAll,
    label,
    multiOf,
    dirty
  }
}

export type FilterDrafts = ReturnType<typeof useFilterDrafts>
