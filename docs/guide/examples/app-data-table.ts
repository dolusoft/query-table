// The state of an AppDataTable page, moved to QueryTable: the five
// `v-model`s become one `query`, the key array of `v-model:selected` becomes
// the selection map, and the request the page sends is read off the query.
// docs/guide/migration-app-data-table.md shows these regions.
import type { RowSelection, SortState, TableQuery } from '@dolusoft/query-table'

// #region request
/** The list request of the page, as `buildPaginationParams` sends it today. */
export interface PaginationRequest {
  SearchText: string
  OrderDirection: 'asc' | 'desc'
  OrderColumnName: string
  /** 0-based. */
  Page: number
  PageSize: number
  FilterColumns: Record<string, unknown>
}

/**
 * `query` is 1-based and holds the sort as an object; the backend name of a
 * field that differs from the column's `field` (the old `sortKey`) comes from
 * `backendNames`. The page's own filters (its toolbar selects) stay outside
 * the query and go in as they are.
 */
export const paginationRequestOf = (
  query: TableQuery,
  filterColumns: Record<string, unknown> = {},
  backendNames: Record<string, string> = {}
): PaginationRequest => ({
  SearchText: query.search ?? '',
  OrderDirection: query.sort?.direction ?? 'desc',
  OrderColumnName: query.sort
    ? (backendNames[query.sort.field] ?? query.sort.field)
    : '',
  Page: query.page - 1,
  PageSize: query.pageSize,
  FilterColumns: filterColumns
})
// #endregion request

// #region sort
/** The URL form of `v-model:sort` (`''`, `'name'`, `'-name'`) and back. */
export const sortOf = (text: string): SortState | null => {
  if (text === '') {
    return null
  }
  return text.startsWith('-')
    ? { field: text.slice(1), direction: 'desc' }
    : { field: text, direction: 'asc' }
}

export const sortText = (sort: SortState | null): string =>
  sort === null ? '' : `${sort.direction === 'desc' ? '-' : ''}${sort.field}`
// #endregion sort

// #region selection
/**
 * `v-model:selection` is a map from the row key, as a string, to `true`.
 * The page's bulk action and its count read the keys.
 */
export const selectedKeys = (selection: RowSelection): string[] =>
  Object.keys(selection).filter(key => selection[key])

export const selectionOf = (keys: readonly (string | number)[]): RowSelection =>
  Object.fromEntries(keys.map(key => [String(key), true]))
// #endregion selection
