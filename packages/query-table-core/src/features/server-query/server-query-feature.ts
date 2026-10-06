// serverQueryFeature (ADR 0004, D2, D4): TanStack's sort, filter, page and
// global filter state ↔ the consumer's query.
//
// The consumer owns the query (controlled, C-01). The adapter passes the
// TanStack slices as a projection of the query it is given
// (`projectServerQuery`); this plugin replaces the slices' `on*Change`
// handlers, so a TanStack action never writes state but emits one new query.
// Updaters resolve against the projection of the base query: the update
// emitted in this tick that the consumer has not answered, else the query
// shown (the port of 2.2 `use-query-emitter.ts`). Two actions in one tick
// therefore stack (C-14) and an ignored update changes nothing (C-19).
import {
  cloneQuery,
  isCursorQuery,
  type Query,
  type QueryChangeReason,
  sameQuery,
  sameRules,
  searchOf,
  withSearch
} from '@dolusoft/query-protocol'
import {
  assignPrototypeAPIs,
  assignTableAPIs,
  type ColumnFiltersState,
  functionalUpdate,
  type PaginationState,
  type SortingState,
  type TableFeature,
  type Updater
} from '@tanstack/table-core'

import {
  applyColumnFilters,
  fromSorting,
  toColumnFilters,
  toPagination,
  toSorting
} from './projection'
import {
  type AnyColumn,
  type AnyTable,
  broad,
  currentReason,
  isDisposed,
  markEmitted,
  onDispose,
  runBeforeAction
} from '../../shared'

/** The handlers this plugin puts in place of TanStack's (C-61). */
interface Handlers {
  onSortingChange: (updater: Updater<SortingState>) => void
  onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void
  onPaginationChange: (updater: Updater<PaginationState>) => void
  onGlobalFilterChange: (updater: Updater<unknown>) => void
}

interface Instance {
  /** The last update emitted and not answered yet, until the tick ends. */
  lastEmitted: Query | null
  /** The `query` option at the time `lastEmitted` was set. */
  shownAtEmit: Query | null
  handlers: Handlers
}

const instances = new WeakMap<object, Instance>()

/** The defaults are pinned: the user cannot replace them (C-61). */
const pinned = {
  manualSorting: true,
  manualFiltering: true,
  manualPagination: true,
  // C-07: ascending first for every type (TanStack starts numbers at desc).
  sortDescFirst: false,
  // The query holds a single sort (C-07).
  enableMultiSort: false
} as const

/** The query a new action builds on (includes an emit not yet answered). */
const baseOf = (table: AnyTable): Query => {
  const shown = table.options.query
  const instance = instances.get(table)
  if (!instance) {
    return shown
  }
  // The consumer answered (a new `query` object): its query is the base.
  if (instance.lastEmitted && shown !== instance.shownAtEmit) {
    instance.lastEmitted = null
  }
  return instance.lastEmitted ?? shown
}

/**
 * Emits `next` unless it says the same as the base (C-04, C-19). Nothing is
 * emitted once the table is disposed (C-62).
 */
const emit = (
  table: AnyTable,
  next: Query,
  reason: QueryChangeReason
): boolean => {
  const instance = instances.get(table)
  if (!instance || isDisposed(table) || sameQuery(next, baseOf(table))) {
    return false
  }
  const sent = cloneQuery(next)
  instance.lastEmitted = sent
  instance.shownAtEmit = table.options.query
  // The end of the tick clears this emit only; a later one keeps its base.
  queueMicrotask(() => {
    if (instance.lastEmitted === sent) {
      instance.lastEmitted = null
    }
  })
  markEmitted(table)
  // A new object, sharing nothing with the base or the props (C-03).
  table.options.onQueryChange(cloneQuery(next), reason)
  return true
}

/**
 * The paging position every change but a step goes back to: page 1, or in
 * cursor mode the first page (C-57).
 */
const restart = (query: Query): Query =>
  isCursorQuery(query) ? { ...query, cursor: null } : { ...query, page: 1 }

const sortAction = (table: AnyTable, updater: Updater<SortingState>) => {
  runBeforeAction(table)
  const base = cloneQuery(baseOf(broad(table)))
  const sort = fromSorting(functionalUpdate(updater, toSorting(base)))
  // C-07: the page is kept. C-57: a cursor belongs to the old order.
  const next: Query = isCursorQuery(base)
    ? { ...base, sort, cursor: null }
    : { ...base, sort }
  emit(table, next, 'sort')
}

/**
 * A filter action does not run the before-action flushes: applying pending
 * filter text is itself a filter action, the one the flush dispatches
 * (C-14). Entry values that are not rule lists are ignored.
 */
const filterAction = (
  table: AnyTable,
  updater: Updater<ColumnFiltersState>
) => {
  const base = cloneQuery(baseOf(broad(table)))
  const entries = functionalUpdate(updater, toColumnFilters(base))
  const filters = applyColumnFilters(base.filters, entries)
  // C-04: rules that say the same are no change, not a trip to page 1.
  if (sameRules(filters, base.filters)) {
    return
  }
  emit(table, restart({ ...base, filters }), currentReason(table) ?? 'filter')
}

const pageAction = (table: AnyTable, updater: Updater<PaginationState>) => {
  const flushed = runBeforeAction(table)
  const base = cloneQuery(baseOf(broad(table)))
  const cursors = table.options.cursors
  const current = toPagination({ query: base, cursors, pageRows: 0 })
  const next = functionalUpdate(updater, current)
  if (next.pageSize !== current.pageSize) {
    // C-06 (override): TanStack keeps the top row in view; the contract goes
    // back to page 1 (C-57: the first cursor page). Sizes that are not whole
    // numbers are ignored (TanStack already lifts sizes below 1 to 1).
    if (!Number.isInteger(next.pageSize) || next.pageSize < 1) {
      return
    }
    emit(table, restart({ ...base, pageSize: next.pageSize }), 'pageSize')
    return
  }
  // C-14: the page asked for belongs to the filters before the flush.
  if (flushed) {
    return
  }
  if (isCursorQuery(base)) {
    // C-56: a step is a request for the cursor on that side.
    const step = Math.sign(next.pageIndex - current.pageIndex)
    const token = step > 0 ? cursors?.next : cursors?.prev
    if (step === 0 || typeof token !== 'string') {
      return
    }
    emit(
      table,
      { ...base, cursor: { token, direction: step > 0 ? 'next' : 'prev' } },
      'page'
    )
    return
  }
  if (!Number.isInteger(next.pageIndex) || next.pageIndex < 0) {
    return
  }
  emit(table, { ...base, page: next.pageIndex + 1 }, 'page')
}

/** C-58: a string as given, a number as text; anything else is no search. */
const searchText = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : ''

const searchAction = (table: AnyTable, updater: Updater<unknown>) => {
  runBeforeAction(table)
  const base = cloneQuery(baseOf(broad(table)))
  const text = searchText(functionalUpdate(updater, base.search))
  // C-58: the text the query has is no change, not a trip to the first page.
  if (text === searchOf(base)) {
    return
  }
  emit(table, restart(withSearch(base, text)), 'search')
}

/**
 * The header click (C-07): asc → desc → none from the base query, so two
 * calls in one tick are two steps (spike REPORT, scenario 5).
 */
const toggleQuerySorting = (column: AnyColumn) => {
  const { table } = column
  if (!column.getCanSort()) {
    return
  }
  const sort = baseOf(table).sort
  const direction = sort?.field === column.id ? sort.direction : null
  if (direction === 'asc') {
    column.toggleSorting(true, false)
  } else if (direction === 'desc') {
    column.clearSorting()
  } else {
    column.toggleSorting(false, false)
  }
}

const ownHandlers = (table: AnyTable): Handlers => ({
  onSortingChange: updater => sortAction(table, updater),
  onColumnFiltersChange: updater => filterAction(table, updater),
  onPaginationChange: updater => pageAction(table, updater),
  onGlobalFilterChange: updater => searchAction(table, updater)
})

/** Throws when the options replace what the plugin owns (C-61). */
const checkOwnership = (table: AnyTable, handlers: Handlers) => {
  const options = table.options as unknown as Record<string, unknown>
  const replaced = [
    ...Object.entries(handlers)
      .filter(([key, handler]) => options[key] !== handler)
      .map(([key]) => key),
    ...Object.entries(pinned)
      .filter(([key, value]) => options[key] !== value)
      .map(([key]) => key)
  ]
  if (replaced.length > 0) {
    throw new Error(
      `[query-table] serverQueryFeature owns ${replaced.join(', ')}: the query is the consumer's (pass \`query\` and \`onQueryChange\` instead)`
    )
  }
}

/**
 * The plugin's own `on*Change` handlers and pinned defaults for `table`,
 * created once per table (TanStack calls `getDefaultTableOptions` before
 * `initTableInstanceData`).
 */
const handlersOf = (table: AnyTable): Handlers => {
  let instance = instances.get(table)
  if (!instance) {
    instance = {
      lastEmitted: null,
      shownAtEmit: null,
      handlers: ownHandlers(table)
    }
    instances.set(table, instance)
  }
  return instance.handlers
}

export const serverQueryFeature: TableFeature = {
  // D4: the server sorts, filters and pages; the handlers emit the query.
  // TanStack merges these under the user's options, so `initTableInstanceData`
  // checks that they held (C-61).
  getDefaultTableOptions: table => ({ ...pinned, ...handlersOf(broad(table)) }),

  // A column filter entry holds the field's rules (`FilterRule[]`). TanStack
  // drops an entry whose filter function says "remove" (and an `undefined`
  // one): an empty list, `null` or `''` clears the field. Any other value
  // that is not a list is kept and ignored, so the field keeps its rules
  // (C-10). The rows are never filtered here (manual).
  getDefaultColumnDef: () => ({
    filterFn: Object.assign(() => true, {
      autoRemove: (value: unknown) =>
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
    })
  }),

  initTableInstanceData: table => {
    checkOwnership(broad(table), handlersOf(broad(table)))
    onDispose(table, () => instances.delete(table))
  },

  constructTableAPIs: generic => {
    const table = broad(generic)
    // C-56: in cursor mode the page index is a position, not a page number,
    // so `setPageIndex` moves by one step only (`old => old ± 1`). A number
    // or a longer jump does nothing: TanStack would clamp it into a step.
    // `nextPage` and `previousPage` do not go through this API.
    const stock = table.setPageIndex as
      ((updater: Updater<number>) => void) | undefined
    assignTableAPIs('serverQueryFeature', table, {
      table_getBaseQuery: { fn: () => cloneQuery(baseOf(table)) },
      ...(stock && {
        table_setPageIndex: {
          fn: (updater: Updater<number>) => {
            if (isCursorQuery(baseOf(table))) {
              const at = toPagination({
                query: baseOf(table),
                cursors: table.options.cursors,
                pageRows: 0
              }).pageIndex
              if (
                typeof updater !== 'function' ||
                Math.abs(updater(at) - at) !== 1
              ) {
                return
              }
            }
            stock(updater)
          }
        }
      })
    })
  },

  assignColumnPrototype: (prototype, table) => {
    assignPrototypeAPIs('serverQueryFeature', prototype, table, {
      column_toggleQuerySorting: {
        fn: (column: AnyColumn) => toggleQuerySorting(column)
      }
    })
  }
}
