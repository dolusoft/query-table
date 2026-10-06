// A consumer of the composable: `useTable` from vue-table with the stock
// features the table uses and the two plugins, drawing its own markup (the
// "TanStack + shadcn" path of the playground). The spike component has the
// same setup, so its own render code is what `component` adds on top.
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
import { createApp, h, shallowRef } from 'vue'

import { filterInputFeature } from '../core/filter-input-feature'
import type { SpikeQuery } from '../core/query'
import { serverQueryFeature } from '../core/server-query-feature'

// Exported so that legacy-plus-composable can keep it: the root manifest
// says `sideEffects: false`, so a bare import would be dropped.
export const mountComposable = (selector: string) =>
  createApp({
    setup() {
      const query = shallowRef<SpikeQuery>({
        page: 1,
        pageSize: 20,
        sort: null,
        filters: []
      })
      const table = useTable({
        features: tableFeatures({
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
        get query() {
          return query.value
        },
        paging: { mode: 'page', totalRows: 1 },
        onQueryChange: (next: SpikeQuery) => {
          query.value = next
        }
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
  }).mount(selector)

mountComposable('#app')
