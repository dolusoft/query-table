# vue-server-table

A thin Vue 3 table for server-side data. It renders the rows you give it and emits a single `change` event when the user sorts, filters or pages; fetching and ordering the data is up to you.

## Install

```bash
pnpm add https://github.com/dolusoft/vue-server-table/releases/download/v2.0.0/dolusoft-vue-server-table-2.0.0.tgz
```

Peer dependencies: `vue` 3.5+ and `floating-vue` (registered globally with `app.use(FloatingVue)`).

## Usage

```vue
<script setup lang="ts">
import VueServerTable from '@dolusoft/vue-server-table'

const columns = [{ field: 'name', title: 'Name' }]
const rows = ref([])
const total = ref(0)

async function onChange(params) {
  // params: current_page, pagesize, sort_column, sort_direction, column_filters, change_type
  const res = await fetchRows(params)
  rows.value = res.rows
  total.value = res.total
}
</script>

<template>
  <VueServerTable :rows="rows" :columns="columns" :total-rows="total" @change="onChange" />
</template>
```

## License

MIT
