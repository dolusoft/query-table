// filterInputFeature (ADR 0003, ADR 0004): the text typed per column, parsed
// with the protocol's grammar and applied through TanStack's own
// `setColumnFilters`.
//
// It never imports serverQueryFeature. It reads the rules from the
// `columnFilters` state (one entry per column, its value the column's
// `FilterRule[]`), writes them with `setColumnFilters`, and registers its
// flush with shared/ so the actions of the owner of the query apply pending
// text first (C-14). Whoever owns `columnFilters` decides what an applied
// filter means: serverQueryFeature emits a query, plain TanStack keeps the
// state.
import {
  columnTypeOf,
  defaultConditionFor,
  draftFromRules,
  draftHasContent,
  type FilterColumn,
  type FilterCondition,
  type FilterDraft,
  type FilterRule,
  parseDraft,
  previewCondition,
  sameRules
} from '@dolusoft/query-protocol'
import {
  assignPrototypeAPIs,
  assignTableAPIs,
  type ColumnFiltersState,
  makeStateUpdater,
  type TableFeature
} from '@tanstack/table-core'

import type { FilterDrafts, FilterLabel } from './types'
import {
  type AnyColumn,
  type AnyTable,
  broad,
  dispatch,
  isDisposed,
  onBeforeAction,
  onDispose
} from '../../shared'

/** The default `filterDebounce` (C-09). */
const defaultDebounce = 100

/**
 * How many emitted rule sets per column are remembered for the echo check
 * (C-18). Older emits are only counted (`forgotten`): their answers are
 * recognised by order, not by content.
 */
const emittedLimit = 8

const blank: Readonly<FilterDraft> = Object.freeze({
  text: '',
  condition: null
})

/** Plain, non-reactive state per table; drafts live in TanStack state. */
interface Instance {
  timers: Map<string, ReturnType<typeof setTimeout>>
  /** Rules per column as of the last reconciliation. */
  seen: Map<string, FilterRule[]>
  /** Rules emitted per column and not answered yet, oldest first. */
  emitted: Map<string, FilterRule[][]>
  /** Emits per column that fell out of `emitted`, still unanswered. */
  forgotten: Map<string, number>
}

const instances = new WeakMap<object, Instance>()

const filterColumnOf = (column: AnyColumn): FilterColumn => ({
  field: column.id,
  type: column.columnDef.filterType
})

const columnsOf = (table: AnyTable): AnyColumn[] => table.getAllLeafColumns()

const draftsOf = (table: AnyTable): FilterDrafts =>
  table.atoms.filterDrafts?.get() ?? {}

const draftOf = (table: AnyTable, id: string): Readonly<FilterDraft> =>
  draftsOf(table)[id] ?? blank

const setDrafts = (
  table: AnyTable,
  update: (drafts: FilterDrafts) => FilterDrafts
) => makeStateUpdater('filterDrafts', table)(update)

const setDraft = (table: AnyTable, id: string, draft: FilterDraft) =>
  setDrafts(table, drafts => ({ ...drafts, [id]: draft }))

/** The rules of column `id` in a `columnFilters` state. */
const rulesIn = (entries: ColumnFiltersState, id: string): FilterRule[] => {
  const value = entries.find(entry => entry.id === id)?.value
  return Array.isArray(value) ? (value as FilterRule[]) : []
}

const shownFilters = (table: AnyTable): ColumnFiltersState =>
  table.atoms.columnFilters?.get() ?? []

const cancel = (instance: Instance, id: string) => {
  const timer = instance.timers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    instance.timers.delete(id)
  }
}

/** The rules the draft of `column` stands for. */
const parsedRules = (column: AnyColumn, draft: FilterDraft): FilterRule[] =>
  parseDraft(filterColumnOf(column), draft).map(rule => ({
    field: column.id,
    condition: rule.condition,
    value: rule.value
  }))

/** Remembers `rules` as emitted for `id`; returns how to undo it. */
const remember = (instance: Instance, id: string, rules: FilterRule[]) => {
  const before = instance.emitted.get(id)
  const beforeForgotten = instance.forgotten.get(id)
  const sent = [...(before ?? []), rules]
  const over = Math.max(0, sent.length - emittedLimit)
  instance.emitted.set(id, sent.slice(over))
  instance.forgotten.set(id, (beforeForgotten ?? 0) + over)
  return () => {
    if (before) {
      instance.emitted.set(id, before)
    } else {
      instance.emitted.delete(id)
    }
    if (beforeForgotten === undefined) {
      instance.forgotten.delete(id)
    } else {
      instance.forgotten.set(id, beforeForgotten)
    }
  }
}

/**
 * Applies the drafts of `ids` in one `setColumnFilters` call: one call is
 * one action, so the owner of the state emits once (C-04, C-13). A column
 * whose draft changes nothing is left out. `true` when it changed the
 * filters: an update was emitted, or with no owner that emits (plain
 * TanStack state), the state was written.
 */
const commit = (table: AnyTable, ids: readonly string[]): boolean => {
  const instance = instances.get(table)
  if (!instance || isDisposed(table)) {
    return false
  }
  for (const id of ids) {
    cancel(instance, id)
  }
  const columns = columnsOf(table).filter(column => ids.includes(column.id))
  if (columns.length === 0) {
    return false
  }
  const undo: Array<() => void> = []
  let changed = false
  const emitted = dispatch(
    table,
    () =>
      table.setColumnFilters((old: ColumnFiltersState) => {
        // The updater runs against the base the owner builds on; the echo
        // history is written here, before the owner emits, so an answer
        // given inside the emit is already recognised (C-18).
        let next = old
        for (const column of columns) {
          const rules = parsedRules(column, draftOf(table, column.id))
          if (sameRules(rulesIn(next, column.id), rules)) {
            continue
          }
          changed = true
          next = replaceEntry(next, column.id, rules)
          undo.push(remember(instance, column.id, rules))
        }
        return next
      }),
    'filter'
  )
  if (!emitted) {
    undo.reverse().forEach(revert => revert())
  }
  return emitted || changed
}

/**
 * `entries` with the entry of `id` holding `rules`, in place when it exists,
 * removed when there is no rule, appended otherwise.
 */
const replaceEntry = (
  entries: ColumnFiltersState,
  id: string,
  rules: FilterRule[]
): ColumnFiltersState => {
  const index = entries.findIndex(entry => entry.id === id)
  if (rules.length === 0) {
    return index < 0 ? entries : entries.filter(entry => entry.id !== id)
  }
  const entry = { id, value: rules }
  return index < 0
    ? [...entries, entry]
    : entries.map((old, i) => (i === index ? entry : old))
}

const debounceOf = (table: AnyTable): number =>
  table.options.filterDebounce ?? defaultDebounce

const schedule = (table: AnyTable, id: string) => {
  const instance = instances.get(table)
  if (!instance) {
    return
  }
  cancel(instance, id)
  const wait = debounceOf(table)
  if (wait <= 0 || draftOf(table, id).text.trim() === '') {
    commit(table, [id])
    return
  }
  instance.timers.set(
    id,
    setTimeout(() => commit(table, [id]), wait)
  )
}

/** Applies every pending draft in one update (C-13, C-14). */
const flushAll = (table: AnyTable): boolean => {
  const instance = instances.get(table)
  return instance ? commit(table, [...instance.timers.keys()]) : false
}

const setInput = (column: AnyColumn, text: string) => {
  const { table } = column
  if (isDisposed(table)) {
    return
  }
  setDraft(table, column.id, {
    ...draftOf(table, column.id),
    text,
    multi: undefined
  })
  schedule(table, column.id)
}

const applyInput = (column: AnyColumn) => {
  const { table } = column
  if (instances.get(table)?.timers.has(column.id)) {
    commit(table, [column.id])
  }
}

const clearInput = (column: AnyColumn) => {
  const { table } = column
  const instance = instances.get(table)
  if (!instance) {
    return
  }
  cancel(instance, column.id)
  setDraft(table, column.id, { text: '', condition: null })
  commit(table, [column.id])
}

const setCondition = (column: AnyColumn, condition: FilterCondition | null) => {
  const { table } = column
  if (!instances.has(table)) {
    return
  }
  if (condition === null) {
    clearInput(column)
    return
  }
  const draft = { ...draftOf(table, column.id) }
  if (draft.multi) {
    // Picking a condition is an explicit edit: the first rule's value
    // carries over, the other rules go.
    const first = rulesIn(shownFilters(table), column.id)[0]
    draft.text = first ? String(first.value) : ''
    draft.multi = undefined
  }
  draft.condition = condition
  setDraft(table, column.id, draft)
  commit(table, [column.id])
}

const clearAll = (table: AnyTable) => {
  const instance = instances.get(table)
  if (!instance) {
    return
  }
  for (const id of instance.timers.keys()) {
    cancel(instance, id)
  }
  // Pending text is discarded, not applied (C-14, C-22).
  setDrafts(table, drafts =>
    Object.fromEntries(
      Object.keys(drafts).map(id => [id, { text: '', condition: null }])
    )
  )
  dispatch(table, () => table.setColumnFilters([]), 'reset')
}

const label = (column: AnyColumn): FilterLabel | null => {
  const { table } = column
  const draft = draftOf(table, column.id)
  if (!draftHasContent(draft)) {
    return null
  }
  const type = columnTypeOf(filterColumnOf(column))
  const base = draft.condition ?? defaultConditionFor(type)
  const condition =
    type === 'string' ? previewCondition(draft.text, base) : base
  return {
    condition,
    count: draft.multi ?? parseDraft(filterColumnOf(column), draft).length
  }
}

const canClearAll = (table: AnyTable): boolean =>
  shownFilters(table).length > 0 ||
  columnsOf(table).some(column => draftHasContent(draftOf(table, column.id)))

/** Drops what is kept for a column that is no longer in the table. */
const forget = (table: AnyTable, instance: Instance, id: string) => {
  cancel(instance, id)
  instance.seen.delete(id)
  instance.emitted.delete(id)
  instance.forgotten.delete(id)
  if (id in draftsOf(table)) {
    setDrafts(table, drafts =>
      Object.fromEntries(Object.entries(drafts).filter(([key]) => key !== id))
    )
  }
}

/**
 * Brings the drafts in line with rules that changed from outside (C-18): an
 * echo of the table's own emit, even a late one, leaves the draft as typed;
 * any other change shows the new rules.
 */
const reconcile = (table: AnyTable) => {
  const instance = instances.get(table)
  if (!instance) {
    return
  }
  const columns = columnsOf(table)
  const present = new Set(columns.map(column => column.id))
  // A column that went takes its typed text with it, so Clear all does not
  // stay enabled for text nobody can see (C-22).
  const kept = new Set([
    ...Object.keys(draftsOf(table)),
    ...instance.seen.keys(),
    ...instance.emitted.keys()
  ])
  for (const id of kept) {
    if (!present.has(id)) {
      forget(table, instance, id)
    }
  }
  const filters = shownFilters(table)
  for (const column of columns) {
    const { id } = column
    const rules = rulesIn(filters, id)
    if (sameRules(rules, instance.seen.get(id) ?? [])) {
      continue
    }
    instance.seen.set(id, rules)
    const pending = instance.emitted.get(id) ?? []
    const echo = pending.findIndex(sent => sameRules(sent, rules))
    if (echo >= 0) {
      // Our own emit came back (possibly late): older ones are answered
      // too, newer ones are still on their way. The draft stays as typed.
      instance.emitted.set(id, pending.slice(echo + 1))
      instance.forgotten.delete(id)
      continue
    }
    const late = instance.forgotten.get(id) ?? 0
    if (late > 0) {
      // The answer to an emit no longer remembered; the newer ones are
      // still on their way. Keep them, keep the draft.
      instance.forgotten.set(id, late - 1)
      continue
    }
    // A different set of rules: the consumer has moved on from what we sent.
    instance.emitted.delete(id)
    const draft = draftsOf(table)[id]
    if (draft && sameRules(parsedRules(column, draft), rules)) {
      continue
    }
    if (!draft && rules.length === 0) {
      continue
    }
    cancel(instance, id)
    setDraft(table, id, draftFromRules(filterColumnOf(column), rules))
  }
}

interface Watchable {
  subscribe: (next: () => void) => { unsubscribe: () => void }
}

/** Runs `reconcile` whenever the options (the query, the columns) change. */
const watchOptions = (table: AnyTable) => {
  const source: Watchable | undefined =
    table.optionsStore ?? table.atoms.columnFilters
  if (!source) {
    return
  }
  const subscription = source.subscribe(() => reconcile(table))
  onDispose(table, () => subscription.unsubscribe())
}

export const filterInputFeature: TableFeature = {
  getInitialState: initialState => ({
    filterDrafts: {},
    ...initialState
  }),

  initTableInstanceData: generic => {
    const table = broad(generic)
    const instance: Instance = {
      timers: new Map(),
      seen: new Map(),
      emitted: new Map(),
      forgotten: new Map()
    }
    instances.set(table, instance)
    onBeforeAction(table, () => flushAll(table))
    onDispose(table, () => {
      for (const timer of instance.timers.values()) {
        clearTimeout(timer)
      }
      instances.delete(table)
    })
    reconcile(table)
    watchOptions(table)
  },

  constructTableAPIs: table => {
    assignTableAPIs('filterInputFeature', table, {
      table_flushPendingFilters: { fn: () => flushAll(broad(table)) },
      table_clearAllFilters: { fn: () => clearAll(broad(table)) },
      table_getCanClearAllFilters: { fn: () => canClearAll(broad(table)) }
    })
  },

  assignColumnPrototype: (prototype, table) => {
    assignPrototypeAPIs('filterInputFeature', prototype, table, {
      column_getFilterInput: {
        fn: (column: AnyColumn) => draftOf(column.table, column.id)
      },
      column_setFilterInput: {
        fn: (column: AnyColumn, text: string) => setInput(column, text)
      },
      column_applyFilterInput: {
        fn: (column: AnyColumn) => applyInput(column)
      },
      column_setFilterCondition: {
        fn: (column: AnyColumn, condition: FilterCondition | null) =>
          setCondition(column, condition)
      },
      column_clearFilterInput: {
        fn: (column: AnyColumn) => clearInput(column)
      },
      column_getFilterLabel: { fn: (column: AnyColumn) => label(column) }
    })
  }
}
