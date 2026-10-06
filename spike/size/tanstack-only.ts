// The composable fixture without the two plugins: what TanStack (vue-table,
// table-core, store) costs alone, so `composable` minus this is the plugins.
import {
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
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
        rowSelectionFeature,
        columnSizingFeature,
        columnResizingFeature
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
