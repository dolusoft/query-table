// A headless consumer of the core layer: TanStack table-core with the stock
// features the table uses and the two plugins, no framework.
import {
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
  constructTable,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'

import { filterInputFeature } from '../core/filter-input-feature'
import type { SpikeQuery } from '../core/query'
import { serverQueryFeature } from '../core/server-query-feature'

let query: SpikeQuery = { page: 1, pageSize: 20, sort: null, filters: [] }

const table = constructTable({
  features: tableFeatures({
    coreReactivityFeature: storeReactivityBindings(),
    rowSortingFeature,
    rowPaginationFeature,
    columnFilteringFeature,
    rowSelectionFeature,
    columnSizingFeature,
    columnResizingFeature,
    serverQueryFeature,
    filterInputFeature
  } as never),
  columns: [{ id: 'name', accessorKey: 'name' }],
  data: [{ name: 'a' }],
  query,
  paging: { mode: 'page', totalRows: 1 },
  onQueryChange: (next: SpikeQuery) => {
    query = next
  }
} as never) as { nextPage: () => void; getRowModel: () => { rows: unknown[] } }

table.nextPage()
document.body.textContent = JSON.stringify([
  query,
  table.getRowModel().rows.length
])
