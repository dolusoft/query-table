// A consumer that mounts `DataTable` with every row in the page, importing
// it the way an application does (by name, through the `exports` map).
// Built by `pnpm measure:consumer-size`; never part of the package.
import { createApp, h, type Component } from 'vue'

import { DataTable } from '@dolusoft/query-table/data-table'

createApp({
  // `h()` cannot infer the row type of a generic component, so `rowKey`
  // would read as `never`; a template infers it (pack-install checks one).
  render: () =>
    h(DataTable as Component, {
      columns: [
        { field: 'id', title: 'ID', type: 'integer' },
        { field: 'name', title: 'Name' }
      ],
      rows: [{ id: 1, name: 'Ada' }],
      rowKey: 'id',
      search: ['name'],
      sortable: true,
      filterable: true
    })
}).mount('#app')
