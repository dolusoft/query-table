// The query projected onto TanStack state slices (ADR 0004): the consumer
// owns the query, TanStack's `sorting`, `columnFilters`, `pagination` and
// `globalFilter` are derived from it and never written on their own.
import {
  type FilterRule,
  isCursorQuery,
  type PageCursors,
  type Query,
  replaceRules,
  rulesOf,
  sameRules,
  type SortState
} from '@dolusoft/query-protocol'
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState
} from '@tanstack/table-core'

/** What the projection reads besides the query. */
export interface ServerQueryInput {
  /** The query the table shows (controlled). */
  query: Query
  /**
   * Page mode: the number of rows on the server, `null` or absent when
   * unknown. Pass it to TanStack as `rowCount` too.
   */
  rowCount?: number | null
  /** Cursor mode: the cursors the server answered with for this page. */
  cursors?: PageCursors | null
  /** How many rows the current page holds (`data.length`). */
  pageRows: number
}

export const toSorting = (query: Query): SortingState =>
  query.sort
    ? [{ id: query.sort.field, desc: query.sort.direction === 'desc' }]
    : []

/** The first entry only: the query holds a single sort (C-07). */
export const fromSorting = (sorting: SortingState): SortState | null =>
  sorting[0]
    ? { field: sorting[0].id, direction: sorting[0].desc ? 'desc' : 'asc' }
    : null

/**
 * One entry per field, in the order the field first appears, whose value is
 * that field's `FilterRule[]` (C-17). Fields that match no column are
 * entries too, so they pass through every change (C-10).
 */
export const toColumnFilters = (query: Query): ColumnFiltersState => {
  const fields = [...new Set(query.filters.map(rule => rule.field))]
  return fields.map(id => ({ id, value: rulesOf(query.filters, id) }))
}

/**
 * The rules an entry value stands for, with `field` set to the entry's id.
 * A value that is not an array is no rule list: `undefined`, so the field
 * keeps its rules.
 */
const rulesOfEntry = (id: string, value: unknown): FilterRule[] | undefined =>
  Array.isArray(value)
    ? (value as FilterRule[]).map(rule => ({ ...rule, field: id }))
    : undefined

/**
 * `filters` with the rules of every field whose entry changed replaced in
 * place (`replaceRules`): a field keeps its position, other fields and the
 * other properties of their rules stay as they are (C-03, C-10, C-17).
 */
export const applyColumnFilters = (
  filters: FilterRule[],
  next: ColumnFiltersState
): FilterRule[] => {
  const fields = new Set([
    ...filters.map(rule => rule.field),
    ...next.map(entry => entry.id)
  ])
  let result = filters
  for (const field of fields) {
    const entry = next.find(candidate => candidate.id === field)
    const rules = entry ? rulesOfEntry(field, entry.value) : []
    if (rules && !sameRules(rulesOf(result, field), rules)) {
      result = replaceRules(result, field, rules)
    }
  }
  return result
}

/**
 * Page mode: `pageIndex` is `page - 1` (1-based ↔ 0-based, C-05).
 * Cursor mode: the position is always "here": `pageIndex` is 1 when there is
 * a previous page and 0 otherwise, so TanStack's own `getCanPreviousPage`
 * answers and `previousPage()` / `nextPage()` arrive as a -1 / +1 step that
 * becomes a cursor request (C-56).
 */
export const toPagination = (input: ServerQueryInput): PaginationState => {
  const { query } = input
  return {
    pageIndex: isCursorQuery(query)
      ? input.cursors?.prev
        ? 1
        : 0
      : query.page - 1,
    pageSize: query.pageSize
  }
}

/** The page count for a known total, at least 1 (C-23). */
export const pageCountOf = (rowCount: number, pageSize: number): number =>
  Math.max(1, Math.ceil(rowCount / pageSize))

const isKnown = (rowCount: number | null | undefined): rowCount is number =>
  typeof rowCount === 'number' && Number.isFinite(rowCount)

/**
 * TanStack's `pageCount` option.
 *
 * - Page mode, known total: `ceil(rowCount / pageSize)`, at least 1, so
 *   TanStack clamps a page step to `[1, pageCount]` (C-05).
 * - Page mode, unknown total: `-1` (no last page) while the page is full,
 *   else the current page is the last (C-23: a short page has no next).
 * - Cursor mode: one more page than the current position exactly when there
 *   is a next cursor, so `getCanNextPage` answers (C-56).
 */
export const toPageCount = (input: ServerQueryInput): number => {
  const { query } = input
  const { pageIndex } = toPagination(input)
  if (isCursorQuery(query)) {
    return pageIndex + (input.cursors?.next ? 2 : 1)
  }
  if (isKnown(input.rowCount)) {
    return pageCountOf(input.rowCount, query.pageSize)
  }
  return input.pageRows >= query.pageSize ? -1 : pageIndex + 1
}

/** The TanStack state slices the query owns. */
export interface ServerQueryState {
  sorting: SortingState
  columnFilters: ColumnFiltersState
  pagination: PaginationState
  globalFilter: string | undefined
}

/**
 * The projection to pass to TanStack: `state` slices and the `pageCount`
 * option. Spread `state` into the table's `state` next to the slices the
 * query does not own (row selection, expansion):
 *
 * ```ts
 * const { state, pageCount } = projectServerQuery({ query, rowCount, pageRows: data.length })
 * table.setOptions(old => ({ ...old, query, rowCount, pageCount, state: { ...state, rowSelection } }))
 * ```
 */
export const projectServerQuery = (
  input: ServerQueryInput
): { state: ServerQueryState; pageCount: number } => ({
  state: {
    sorting: toSorting(input.query),
    columnFilters: toColumnFilters(input.query),
    pagination: toPagination(input),
    globalFilter: input.query.search || undefined
  },
  pageCount: toPageCount(input)
})
