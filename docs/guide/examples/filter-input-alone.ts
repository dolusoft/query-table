import { filterInputFeature } from '@dolusoft/query-table-core/filter-input'
import {
  columnFilteringFeature,
  constructTable,
  tableFeatures
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'

// #region alone
// `filterInputFeature` needs no `serverQueryFeature`: on plain TanStack state
// the typed text is parsed and written to `columnFilters`.
const table = constructTable({
  features: tableFeatures({
    coreReactivityFeature: storeReactivityBindings(),
    columnFilteringFeature,
    filterInputFeature
  }),
  columns: [
    { id: 'name', accessorKey: 'name' as const },
    { id: 'age', accessorKey: 'age' as const, filterType: 'number' as const }
  ],
  data: [{ name: 'Ali', age: 31 }],
  filterDebounce: 0
})

export function typeIntoName() {
  table.getColumn('name')!.setFilterInput('ali*,!veli')
  // table.store.state.columnFilters is now
  // [{ id: 'name', value: [<StartsWith ali>, <NotEqual veli>] }]
  return table.store.state.columnFilters
}
// #endregion alone
