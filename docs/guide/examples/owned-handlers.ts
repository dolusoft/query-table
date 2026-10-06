import type { Query } from '@dolusoft/query-protocol'
import { serverQueryFeature } from '@dolusoft/query-table-core/server-query'
import {
  columnFilteringFeature,
  constructTable,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'

const features = tableFeatures({
  coreReactivityFeature: storeReactivityBindings(),
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  serverQueryFeature
})

const query: Query = { page: 1, pageSize: 10, sort: null, filters: [] }

// #region owned
// `serverQueryFeature` owns `onSortingChange`, `onColumnFiltersChange`,
// `onPaginationChange` and `onGlobalFilterChange`, and pins the `manual*`
// flags, `sortDescFirst: false` and `enableMultiSort: false` (C-61).
// Replacing one throws when the table is built.
export function replaceTheHandler(): string {
  try {
    constructTable({
      features,
      columns: [{ id: 'name', accessorKey: 'name' as const }],
      data: [{ name: 'Ali' }],
      query,
      onQueryChange: () => {},
      onSortingChange: () => {} // not yours: use `query` and `onQueryChange`
    })
    return 'built'
  } catch (error) {
    return (error as Error).message
    // [query-table] serverQueryFeature owns onSortingChange: the query is
    // the consumer's (pass `query` and `onQueryChange` instead)
  }
}
// #endregion owned
