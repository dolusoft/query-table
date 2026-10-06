// A consumer that draws its own markup from `useQueryTable()` (the advanced
// path), importing the package by name through its `exports` map. Built by
// `pnpm measure:consumer-size`; never part of the package.
import { createApp, h, ref } from 'vue'

import { useQueryTable } from '@dolusoft/query-table'

createApp({
  setup() {
    const query = ref({ page: 1, pageSize: 10, sort: null, filters: [] })
    const state = useQueryTable({
      query,
      columns: [{ field: 'name', title: 'Name' }],
      rows: [{ name: 'a' }],
      totalRows: 1,
      sortable: true,
      onQueryChange: next => {
        query.value = next
      }
    })
    return () =>
      h('div', [
        ...state.columns.value.map(entry =>
          h('button', { onClick: () => state.sort.sortBy(entry.column) }, [
            entry.column.title
          ])
        ),
        h('input', {
          onInput: (event: Event) =>
            state.filters.setInput(
              'name',
              (event.target as HTMLInputElement).value
            )
        }),
        h('span', String(state.pagination.value.pageCount))
      ])
  }
}).mount('#app')
