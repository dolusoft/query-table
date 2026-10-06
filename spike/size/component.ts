// A consumer of the spike component. Its markup is far smaller than the 2.2
// component's (no filter row, menus, pin offsets, keyboard resize, slots),
// so this is a lower bound of the v3 component.
import { createApp, h } from 'vue'

import { SpikeTable } from '../vue/spike-table'

createApp({
  render: () =>
    h(SpikeTable, {
      query: { page: 1, pageSize: 10, sort: null, filters: [] },
      columns: [{ field: 'name', title: 'Name' }],
      rows: [{ id: 1, name: 'a' }],
      totalRows: 1
    })
}).mount('#app')
