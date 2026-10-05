# vue-server-table

A thin Vue 3 table for server-side data. It renders the rows you give it and tells you, through `v-model:query`, what the user asked for: a page, a page size, a sort or a filter. Fetching and ordering the data is up to you.

The table ships no CSS. It renders plain markup with a small, stable set of `bh-` classes and `data-*` attributes; style them with your own design system.

## Install

```bash
pnpm add https://github.com/dolusoft/vue-server-table/releases/download/v2.2.4/dolusoft-vue-server-table-2.2.4.tgz
```

Peer dependency: `vue` 3.5+.

## Usage

```vue
<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import VueServerTable, { type TableQuery } from '@dolusoft/vue-server-table'

const columns = [{ field: 'name', title: 'Name' }]
const query = ref<TableQuery>({ page: 1, pageSize: 10, sort: null, filters: [] })
const rows = ref([])
const total = ref(0)

watchEffect(async () => {
  const res = await fetchRows(query.value)
  rows.value = res.rows
  total.value = res.total
})
</script>

<template>
  <VueServerTable
    v-model:query="query"
    :columns="columns"
    :rows="rows"
    :total-rows="total"
    sortable
    filterable
  />
</template>
```

## Row identity

Pass `row-key` when rows can reorder or change between pages and you use `has-subtable`: the expanded state and the state of the components in the `subtable` slot then follow the row. A string `row-key` is a direct property read (`row[rowKey]`), not a dotted path; for a nested value pass a function, `(row) => row.meta.id`. Keys must be unique. Without `row-key` rows are matched by index and the expanded state resets whenever `rows` changes.

## Contract

[`CONTRACT.md`](./CONTRACT.md) is the full public contract: props, events, slots, types, behavior rules and the DOM the table renders. It is generated from the source and checked in CI.

## License

MIT
