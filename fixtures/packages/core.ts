// A headless consumer of the whole core: TanStack table-core with the stock
// features the table uses and both plugins, no framework. The SPEC-v3 core
// ceiling applies to this fixture.
import type { Query } from '@dolusoft/query-protocol'
import {
  filterInputFeature,
  serverQueryFeature
} from '@dolusoft/query-table-core'
import {
  columnFilteringFeature,
  constructTable,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
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
    rowSelectionFeature,
    serverQueryFeature,
    filterInputFeature
  }),
  columns: [{ id: 'name', accessorKey: 'name' }],
  data: [{ name: 'a' }],
  query,
  onQueryChange: next => {
    query = next
  }
})

table.getColumn('name')?.setFilterInput(location.hash)
table.nextPage()
document.body.textContent = JSON.stringify([
  query,
  table.getRowModel().rows.length
])
