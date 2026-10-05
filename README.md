# Query Table

A thin Vue 3 table for server-side data. It renders the rows you give it and tells you, through `v-model:query`, what the user asked for: a page, a page size, a sort or a filter. Fetching and ordering the data is up to you.

The table ships no CSS. It renders plain markup with a small, stable set of `qt-` classes and `data-*` attributes; style them with your own design system.

## Install

```bash
pnpm add https://github.com/dolusoft/query-table/releases/download/v2.2.7/dolusoft-query-table-2.2.7.tgz
```

Peer dependency: `vue` 3.5+.

## Usage

```vue
<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import QueryTable, { type TableQuery } from '@dolusoft/query-table'

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
  <QueryTable
    v-model:query="query"
    :columns="columns"
    :rows="rows"
    :total-rows="total"
    sortable
    filterable
  />
</template>
```

## Long text

The table draws every cell value in full and never cuts it. To shorten long text, style the cells with your own CSS (`text-overflow: ellipsis` with a fixed width, or `line-clamp`), or render the cell yourself with a `cell-<field>` slot.

## Large tables

The library ships no CSS, so the layout algorithm of the `<table>` is yours. With the browser default, `table-layout: auto`, every column width is worked out from all rows, and the browser lays the whole table out again whenever anything inside it changes, even a single character typed into a filter input. On a table with thousands of rows on one page that shows as a freeze after each keystroke.

For large tables set `table-layout: fixed` and give every column a `width` (`Column.width`, which the table writes as an inline `width` on the `th`):

```css
.qt-table {
  table-layout: fixed;
  width: 100%;
}
```

Measured on a table of about 11,000 rows (77,852 DOM nodes), a forced layout after a filter input changed took 82-152 ms with `auto` and 31 ms with `fixed`. Without widths a `fixed` table splits the width evenly, so set them. Small tables, a few dozen rows, do not need any of this.

## Row identity

Pass `row-key` when rows can reorder or change between pages and you use `has-subtable`: the expanded state and the state of the components in the `subtable` slot then follow the row. A string `row-key` is a direct property read (`row[rowKey]`), not a dotted path; for a nested value pass a function, `(row) => row.meta.id`. Keys must be unique. Without `row-key` rows are matched by index and the expanded state resets whenever `rows` changes.

## Contract

[`CONTRACT.md`](./CONTRACT.md) is the full public contract: props, events, slots, types, behavior rules and the DOM the table renders. It is generated from the source and checked in CI.

## License

MIT
