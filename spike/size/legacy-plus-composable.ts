// The 2.2 component (from dist/) next to the composable fixture: an upper
// bound of the v3 component, since 2.2 still carries the state logic the
// plugins take over.
import { createApp, h } from 'vue'

import QueryTable from '@dolusoft/query-table'

import { mountComposable } from './composable'

mountComposable('#app')
createApp({
  render: () =>
    h(QueryTable, {
      query: { page: 1, pageSize: 10, sort: null, filters: [] },
      columns: [{ field: 'name', title: 'Name' }],
      rows: [{ name: 'a' }],
      totalRows: 1,
      sortable: true,
      filterable: true
    })
}).mount('#app2')
