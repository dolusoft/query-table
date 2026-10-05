import { onScopeDispose, reactive, watch } from 'vue'

import type {
  Column,
  FilterCondition,
  FilterRule,
  QueryChangeReason,
  TableQuery
} from '../contract'
import { defaultConditionFor, isUnaryCondition } from './filter-conditions'
import {
  hasShortcut,
  parseFilterInput,
  previewCondition,
  serializeFilterRules
} from './filter-input-parser'
import {
  cloneQuery,
  columnTypeOf,
  replaceRules,
  rulesOf,
  sameRules
} from './query'

/**
 * What the user has typed or picked for one column. It is a writing buffer,
 * not part of the query: the query only changes when the draft is applied.
 */
export interface Draft {
  text: string
  /** Condition picked from the menu; `null` means the type default. */
  condition: FilterCondition | null
}

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

type Parsed = Array<Pick<FilterRule, 'condition' | 'value'>>

/** The rules a draft stands for. */
const parseDraft = (column: Column, draft: Draft): Parsed => {
  const type = columnTypeOf(column)
  if (isUnaryCondition(draft.condition)) {
    return [{ condition: draft.condition, value: null }]
  }
  const text = draft.text.trim()
  if (text === '') {
    return []
  }
  const condition = draft.condition ?? defaultConditionFor(type)
  switch (type) {
    case 'string':
      return parseFilterInput(text, condition)
    case 'number':
    case 'integer': {
      const value = Number(text)
      return Number.isFinite(value) ? [{ condition, value }] : []
    }
    case 'bool':
      return text === 'true' || text === 'false'
        ? [{ condition, value: text === 'true' }]
        : []
    default:
      return [{ condition, value: text }]
  }
}

/** Text that parses as itself: no operator, no comma, no outer spaces. */
const isPlainText = (value: string) =>
  value !== '' &&
  value === value.trim() &&
  !/[*,]/.test(value) &&
  !value.startsWith('!')

/** The draft that shows `rules` (the inverse of `parseDraft`). */
const draftFromRules = (
  column: Column,
  rules: readonly FilterRule[]
): Draft => {
  if (rules.length === 0) {
    return { text: '', condition: null }
  }
  if (columnTypeOf(column) === 'string') {
    // A rule written without an operator needs its condition as the base.
    const plain = rules.find(rule => !hasShortcut(rule.condition))
    const base = plain?.condition ?? defaultConditionFor('string')
    // A rule of the base condition is written as plain text when the text
    // cannot be read as an operator; the others keep their shortcut.
    const text = rules
      .map(rule => {
        const value = rule.value === null ? '' : String(rule.value)
        return rule.condition === base && isPlainText(value)
          ? value
          : serializeFilterRules([rule])
      })
      .join(',')
    return { text, condition: plain?.condition ?? null }
  }
  const [first] = rules
  return {
    text: first.value === null ? '' : String(first.value),
    condition: first.condition
  }
}

const hasContent = (draft: Draft) =>
  draft.text.trim() !== '' || draft.condition !== null

export const useFilterDrafts = (options: FilterDraftsOptions) => {
  const drafts = reactive<Record<string, Draft>>({})
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  // Rules per field as of the last reconciliation: a field is only
  // reconciled when its rules really changed.
  const seen = new Map<string, FilterRule[]>()

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
  const commit = (field: string) => {
    cancel(field)
    const column = columnOf(field)
    if (!column) {
      return
    }
    const base = options.base()
    const rules: FilterRule[] = parseDraft(column, draftOf(field)).map(
      rule => ({ field, condition: rule.condition, value: rule.value })
    )
    if (sameRules(rulesOf(base.filters, field), rules)) {
      return
    }
    const next = cloneQuery(base)
    next.page = 1
    next.filters = replaceRules(base.filters, field, rules)
    options.update(next, 'filter')
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
    ensure(field).text = text
    schedule(field)
  }

  const flushField = (field: string) => {
    if (timers.has(field)) {
      commit(field)
    }
  }

  const flushAll = () => {
    for (const field of [...timers.keys()]) {
      commit(field)
    }
  }

  const setCondition = (field: string, condition: FilterCondition | null) => {
    if (condition === null) {
      clear(field)
      return
    }
    const draft = ensure(field)
    draft.condition = condition
    if (isUnaryCondition(condition)) {
      draft.text = ''
    }
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

  /** Brings drafts in line with rules that changed from outside. */
  const reconcile = () => {
    const { filters } = options.query()
    for (const column of options.columns()) {
      const { field } = column
      const rules = rulesOf(filters, field)
      if (sameRules(rules, seen.get(field) ?? [])) {
        continue
      }
      seen.set(field, rules)
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
      type === 'string' && !isUnaryCondition(draft.condition)
        ? previewCondition(draft.text, base)
        : base
    return { condition, count: parseDraft(column, draft).length }
  }

  const dirty = () => Object.values(drafts).some(hasContent)

  return {
    draftOf,
    onInput,
    flushField,
    flushAll,
    setCondition,
    clear,
    clearAll,
    label,
    dirty
  }
}

export type FilterDrafts = ReturnType<typeof useFilterDrafts>
