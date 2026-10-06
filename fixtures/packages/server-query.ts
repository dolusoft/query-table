// A headless consumer of serverQueryFeature alone: TanStack table-core with
// the stock features the plugin drives, no framework.
import type { Query } from '@dolusoft/query-protocol'
import { serverQueryFeature } from '@dolusoft/query-table-core/server-query'
import {
  columnFilteringFeature,
  constructTable,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'

let query: Query = { page: 1, pageSize: 20, sort: null, filters: [] }

const table = constructTable({
  features: tableFeatures({
    coreReactivityFeature: storeReactivityBindings(),
    rowSortingFeature,
    rowPaginationFeature,
    columnFilteringFeature,
    globalFilteringFeature,
    serverQueryFeature
  }),
  columns: [{ id: 'name', accessorKey: 'name' }],
  data: [{ name: 'a' }],
  query,
  onQueryChange: next => {
    query = next
  }
})

table.nextPage()
document.body.textContent = JSON.stringify([
  query,
  table.getRowModel().rows.length
])
