// Spike sketch of the protocol layer (`query-protocol`): the query the
// consumer owns and its projection onto TanStack state slices. Zero
// dependencies besides the 2.2 pure helpers it reuses (no Vue, no TanStack).
//
// K6 adds a cursor mode next to page numbers: the consumer passes the
// cursors its server answered with, the table emits which one to follow.
import type {
  FilterRule,
  QueryChangeReason,
  SortState
} from '../../src/contract'
import { replaceRules, rulesOf, sameRules } from '../../src/core/query'

export type { FilterRule, SortState }
export type Reason = QueryChangeReason

interface CursorRequest {
  /** The cursor the server gave for this direction; `null` is the first page. */
  token: string | null
  direction: 'next' | 'prev'
}

export interface SpikeQuery {
  /** 1-based; unused in cursor mode. */
  page: number
  pageSize: number
  sort: SortState | null
  filters: FilterRule[]
  /** Cursor mode only (K6). */
  cursor?: CursorRequest | null
}

/** What the server answered in cursor mode; `null` means no such page. */
export interface PageCursors {
  next: string | null
  prev: string | null
}

export interface Paging {
  mode: 'page' | 'cursor'
  /** Page mode: `undefined` means unknown. */
  totalRows?: number
  /** Cursor mode. */
  cursors?: PageCursors
}

export const cloneQuery = (query: SpikeQuery): SpikeQuery => ({
  page: query.page,
  pageSize: query.pageSize,
  sort: query.sort ? { ...query.sort } : null,
  filters: query.filters.map(rule => ({ ...rule })),
  ...(query.cursor === undefined
    ? {}
    : { cursor: query.cursor ? { ...query.cursor } : null })
})

export const sameQuery = (a: SpikeQuery, b: SpikeQuery): boolean =>
  JSON.stringify(cloneQuery(a)) === JSON.stringify(cloneQuery(b))

export interface SortingEntry {
  id: string
  desc: boolean
}
export interface ColumnFilterEntry {
  id: string
  value: unknown
}
export interface PaginationSlice {
  pageIndex: number
  pageSize: number
}

export const toSorting = (query: SpikeQuery): SortingEntry[] =>
  query.sort
    ? [{ id: query.sort.field, desc: query.sort.direction === 'desc' }]
    : []

export const fromSorting = (
  sorting: readonly SortingEntry[]
): SortState | null =>
  sorting[0]
    ? { field: sorting[0].id, direction: sorting[0].desc ? 'desc' : 'asc' }
    : null

/** One entry per field, in the order the field first appears (C-17). */
export const toColumnFilters = (query: SpikeQuery): ColumnFilterEntry[] => {
  const fields = [...new Set(query.filters.map(rule => rule.field))]
  return fields.map(id => ({ id, value: rulesOf(query.filters, id) }))
}

/**
 * `filters` with the rules of every field whose entry changed replaced in
 * place (`replaceRules`, C-03/C-17). An entry's value is `FilterRule[]`.
 */
export const applyColumnFilters = (
  filters: FilterRule[],
  next: readonly ColumnFilterEntry[]
): FilterRule[] => {
  const fields = new Set([
    ...filters.map(rule => rule.field),
    ...next.map(entry => entry.id)
  ])
  let result = filters
  for (const field of fields) {
    const entry = next.find(candidate => candidate.id === field)
    const rules = (entry?.value as FilterRule[] | undefined) ?? []
    if (!sameRules(rulesOf(result, field), rules)) {
      result = replaceRules(result, field, rules)
    }
  }
  return result
}

/**
 * Page mode: `pageIndex` is `page - 1` (C-05, 1-based ↔ 0-based).
 * Cursor mode: the consumer's position is always "here"; `pageIndex` is 1
 * when a previous page exists and 0 otherwise, so TanStack's own
 * `getCanPreviousPage` answers, and `previousPage()` / `nextPage()` show up
 * as a -1 / +1 step the plugin turns into a cursor request.
 */
export const toPagination = (
  query: SpikeQuery,
  paging: Paging
): PaginationSlice => ({
  pageIndex:
    paging.mode === 'cursor' ? (paging.cursors?.prev ? 1 : 0) : query.page - 1,
  pageSize: query.pageSize
})

/**
 * TanStack's `pageCount` option. Page mode: from `totalRows`, -1 when the
 * total is unknown. Cursor mode: one more page than the current position
 * exactly when a next cursor exists, so `getCanNextPage` answers.
 */
export const toPageCount = (query: SpikeQuery, paging: Paging): number => {
  if (paging.mode === 'cursor') {
    return (
      toPagination(query, paging).pageIndex + (paging.cursors?.next ? 2 : 1)
    )
  }
  if (paging.totalRows === undefined) {
    return -1
  }
  return Math.max(1, Math.ceil(paging.totalRows / query.pageSize))
}
