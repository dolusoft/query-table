// Spike sketch of `serverQueryFeature` (SPEC-v3 K2, D2, D4): TanStack's
// sort, page and filter state ↔ the consumer's query.
//
// The consumer owns the query (controlled). The adapter passes TanStack
// state slices that are projections of the query it is given; this plugin
// replaces the slices' `on*Change` handlers so that a TanStack action never
// writes state but emits one new query. Updaters are resolved against the
// projection of `base()`, the query last emitted in this tick or else the
// one given (the port of `use-query-emitter.ts`), so two actions in one tick
// stack (C-14) and an ignored update changes nothing (C-19).
import {
  assignTableAPIs,
  functionalUpdate,
  type TableFeature,
  type Updater
} from '@tanstack/table-core'

import {
  applyColumnFilters,
  cloneQuery,
  type ColumnFilterEntry,
  fromSorting,
  type PaginationSlice,
  type Paging,
  type Reason,
  sameQuery,
  type SortingEntry,
  type SpikeQuery,
  toColumnFilters,
  toPagination,
  toSorting
} from './query'
import { markEmitted, onDispose, runBeforeAction } from './shared'

interface ServerQueryOptions {
  /** The query the table shows (controlled). */
  query: SpikeQuery
  onQueryChange: (query: SpikeQuery, reason: Reason) => void
  paging: Paging
}

interface Instance {
  lastEmitted: SpikeQuery | null
  /** The `query` option when `lastEmitted` was set. */
  shownAtEmit: SpikeQuery | null
}

const instances = new WeakMap<object, Instance>()

// The spike reads its options untyped; PR-B registers them through
// TanStack's `Plugins` / `TableOptions_FeatureMap` declaration merging.
const optionsOf = (table: { options: unknown }) =>
  table.options as ServerQueryOptions

const instanceOf = (table: object): Instance => {
  let instance = instances.get(table)
  if (!instance) {
    instance = { lastEmitted: null, shownAtEmit: null }
    instances.set(table, instance)
  }
  return instance
}

/** The query a new action builds on (includes an emit not yet answered). */
const baseOf = (table: { options: unknown }): SpikeQuery => {
  const instance = instanceOf(table)
  const shown = optionsOf(table).query
  // The consumer answered (a new `query` object): its query is the base.
  if (instance.lastEmitted && shown !== instance.shownAtEmit) {
    instance.lastEmitted = null
  }
  return instance.lastEmitted ?? shown
}

const emit = (
  table: { options: unknown },
  next: SpikeQuery,
  reason: Reason
): boolean => {
  if (sameQuery(next, baseOf(table))) {
    return false
  }
  const instance = instanceOf(table)
  instance.lastEmitted = cloneQuery(next)
  instance.shownAtEmit = optionsOf(table).query
  queueMicrotask(() => {
    instance.lastEmitted = null
  })
  markEmitted(table)
  optionsOf(table).onQueryChange(cloneQuery(next), reason)
  return true
}

/** Cursor mode: every change but a step starts over at the first page. */
const restart = (query: SpikeQuery, paging: Paging): Partial<SpikeQuery> =>
  paging.mode === 'cursor' ? { cursor: null } : { page: 1 }

const sortAction = (
  table: { options: unknown },
  updater: Updater<SortingEntry[]>
) => {
  runBeforeAction(table)
  const base = baseOf(table)
  const sorting = functionalUpdate(updater, toSorting(base))
  const paging = optionsOf(table).paging
  emit(
    table,
    {
      ...cloneQuery(base),
      sort: fromSorting(sorting),
      // C-07: the page is kept; a cursor belongs to the old order.
      ...(paging.mode === 'cursor' ? { cursor: null } : {})
    },
    'sort'
  )
}

const filterAction = (
  table: { options: unknown },
  updater: Updater<ColumnFilterEntry[]>
) => {
  const base = baseOf(table)
  const next = functionalUpdate(updater, toColumnFilters(base))
  const paging = optionsOf(table).paging
  emit(
    table,
    {
      ...cloneQuery(base),
      filters: applyColumnFilters(base.filters, next),
      ...restart(base, paging)
    },
    'filter'
  )
}

const pageAction = (
  table: { options: unknown },
  updater: Updater<PaginationSlice>
) => {
  const flushed = runBeforeAction(table)
  const base = baseOf(table)
  const paging = optionsOf(table).paging
  const current = toPagination(base, paging)
  const next = functionalUpdate(updater, current)
  if (next.pageSize !== current.pageSize) {
    // C-06 (override): TanStack keeps the top row in view; the contract
    // goes back to page 1. Values below 1 or not whole are ignored.
    if (!Number.isInteger(next.pageSize) || next.pageSize < 1) {
      return
    }
    emit(
      table,
      {
        ...cloneQuery(base),
        pageSize: next.pageSize,
        ...restart(base, paging)
      },
      'pageSize'
    )
    return
  }
  // C-14: the page asked for belongs to the filters before the flush.
  if (flushed) {
    return
  }
  if (paging.mode === 'cursor') {
    const step = Math.sign(next.pageIndex - current.pageIndex)
    const token = step > 0 ? paging.cursors?.next : paging.cursors?.prev
    if (step === 0 || token === undefined || token === null) {
      return
    }
    emit(
      table,
      {
        ...cloneQuery(base),
        cursor: { token, direction: step > 0 ? 'next' : 'prev' }
      },
      'page'
    )
    return
  }
  emit(table, { ...cloneQuery(base), page: next.pageIndex + 1 }, 'page')
}

export const serverQueryFeature: TableFeature = {
  getDefaultTableOptions: table => ({
    // D4: the server sorts, filters and pages.
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    // C-07: ascending first for every type (TanStack starts numbers at desc).
    sortDescFirst: false,
    enableMultiSort: false,
    onSortingChange: (updater: Updater<SortingEntry[]>) =>
      sortAction(table, updater),
    onColumnFiltersChange: (updater: Updater<ColumnFilterEntry[]>) =>
      filterAction(table, updater),
    onPaginationChange: (updater: Updater<PaginationSlice>) =>
      pageAction(table, updater)
  }),

  initTableInstanceData: table => {
    instanceOf(table)
    onDispose(table, () => instances.delete(table))
  },

  constructTableAPIs: table => {
    assignTableAPIs('serverQueryFeature' as never, table, {
      table_getBaseQuery: { fn: () => baseOf(table) }
    })
  }
}
