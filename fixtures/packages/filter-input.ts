// A headless consumer of filterInputFeature alone, on plain TanStack column
// filters, no framework.
import { filterInputFeature } from '@dolusoft/query-table-core/filter-input'
import {
  columnFilteringFeature,
  constructTable,
  tableFeatures
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'

const table = constructTable({
  features: tableFeatures({
    coreReactivityFeature: storeReactivityBindings(),
    columnFilteringFeature,
    filterInputFeature
  }),
  columns: [{ id: 'name', accessorKey: 'name' }],
  data: [{ name: 'a' }]
})

table.getColumn('name')?.setFilterInput(location.hash)
document.body.textContent = JSON.stringify(table.store.state.columnFilters)
