// tanstack-only without `columnSizingFeature` and `columnResizingFeature`:
// what the sizing features cost, if resizing stays our own code (D3).
import {
  columnFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable
} from '@tanstack/vue-table'
import { createApp, h } from 'vue'

createApp({
  setup() {
    const table = useTable({
      features: tableFeatures({
        rowSortingFeature,
        rowPaginationFeature,
        columnFilteringFeature,
        rowSelectionFeature
      }),
      columns: [{ id: 'name', accessorKey: 'name' }],
      data: [{ name: 'a' }]
    } as never) as {
      nextPage: () => void
      getRowModel: () => { rows: { id: string }[] }
    }
    return () =>
      h(
        'ul',
        { onClick: () => table.nextPage() },
        table.getRowModel().rows.map(row => h('li', row.id))
      )
  }
}).mount('#app')
