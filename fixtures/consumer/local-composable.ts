import { createApp, h, ref } from 'vue'

import { defineDataset } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from '@dolusoft/query-table/local'

createApp({
  setup() {
    const query = ref({ page: 1, pageSize: 10, sort: null, filters: [] })
    const local = useLocalQuery({
      allRows: [{ id: 1, name: 'Ada' }],
      query,
      dataset: defineDataset<{ id: number; name: string }>({
        key: 'id',
        fields: {
          id: { type: 'integer' },
          name: { type: 'string', search: true }
        }
      }),
      profile: 'tr-1'
    })
    return () =>
      h('div', [
        local.rows.value.map(row => row.name).join(', '),
        String(local.totalRows.value),
        local.error.value?.code
      ])
  }
}).mount('#app')
