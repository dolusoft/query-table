// The reference without our packages: table-core with the same stock
// features as core.ts. `pnpm measure:package-size` reports the share of the
// plugins and the protocol as core minus this; it has no budget of its own.
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

const table = constructTable({
  features: tableFeatures({
    coreReactivityFeature: storeReactivityBindings(),
    rowSortingFeature,
    rowPaginationFeature,
    columnFilteringFeature,
    globalFilteringFeature,
    rowSelectionFeature
  }),
  columns: [{ id: 'name', accessorKey: 'name' }],
  data: [{ name: 'a' }]
})

table.nextPage()
document.body.textContent = JSON.stringify(table.getRowModel().rows.length)
