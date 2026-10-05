// A consumer that mounts the table, importing the package the way an
// application does (by name, through the `exports` map). Built by
// `pnpm measure:consumer-size`; never part of the package.
import { createApp, h } from 'vue'

import VueServerTable from '@dolusoft/vue-server-table'

createApp({
  render: () =>
    h(VueServerTable, {
      query: { page: 1, pageSize: 10, sort: null, filters: [] },
      columns: [{ field: 'name', title: 'Name' }],
      rows: [{ name: 'a' }],
      totalRows: 1,
      sortable: true,
      filterable: true
    })
}).mount('#app')
