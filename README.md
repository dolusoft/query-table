# Query Table

A thin Vue 3 table for server-side data. It renders the rows you give it and tells you, through `v-model:query`, what the user asked for: a page, a page size, a sort or a filter. Fetching and ordering the data is up to you.

The table ships no CSS. It renders plain markup with a small, stable set of `qt-` classes and `data-*` attributes; style them with your own design system.

## Install

```bash
pnpm add https://github.com/dolusoft/query-table/releases/download/v2.2.10/dolusoft-query-table-2.2.10.tgz
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

## Pinned columns

Set `pinned: 'left'` on a column. Pinned columns are drawn first, in their declared order, and when any column is pinned the utility cells (expand, select) are pinned too. The table marks every pinned `th` and `td` with `data-pinned` and writes its left offset, measured from the rendered widths, as the inline custom property `--qt-pin-left`. Making the cells stick is your CSS:

```css
.qt-table [data-pinned] {
  position: sticky;
  left: var(--qt-pin-left);
  z-index: 1;
  background: white; /* opaque, so scrolled cells pass underneath */
}
.qt-table:has([data-pinned]) {
  border-collapse: separate; /* collapsed borders leave gaps at sticky edges */
  border-spacing: 0;
}
```

The scroll container is `.qt-table-responsive`; to scroll sideways, let the table take its columns' widths but never less than the container:

```css
.qt-table {
  width: max-content;
  min-width: 100%;
}
```

With `width: 100%` the columns squeeze to fit and nothing scrolls; with `max-content` alone a narrow table stops short of the container's right edge.

## Resizing columns

With `resizable` the table draws a `qt-resize-handle` separator at the right edge of every header cell (opt a column out with `resizable: false`). Drag it, or focus it and use the arrow keys (10 px, 50 px with Shift); Enter or a double click fits the column to its widest rendered content, Escape cancels a drag. Widths stay between `minWidth` (default 40) and `maxWidth`. The table keeps no width: it emits `column-resize` with `{ field, width }` and you write it back:

```vue
<QueryTable :columns="columns" resizable @column-resize="({ field, width }) => (widths[field] = width)" />
```

where `columns` turns each saved number into `Column.width` (for example `'180px'`). Use `table-layout: fixed` (see Large tables) so the header width is the column width; with the automatic layout the content can override it. Style the handle with your CSS: `position: absolute` over the right edge of a `position: relative` `th`, about 8px wide for the pointer, drawing nothing at rest and a 1px line on header hover and on `:focus-visible`. Together with the sizing above:

```css
.qt-table {
  table-layout: fixed;
  width: max-content;
  min-width: 100%;
}
```

## Header slot

`header-<field>` replaces the title (or sort button) of a header cell. It receives `{ column, sortDirection, sortable, toggleSort }`; call `toggleSort` from your own button to keep sorting.

## Loading

Set `loading` while you fetch. The table keeps the rows you gave it (nothing is cleared, focus stays), hides the empty state, and marks the root with `data-loading` and `aria-busy="true"`. A `loading` slot is drawn as the last row of the body, `tr.qt-loading-row`, with one cell that spans every column. The table writes no style for it and blocks no interaction; laying it over the rows is your CSS:

```css
.qt-datatable[data-loading] tbody {
  position: relative;
}
.qt-loading-row {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 0.6);
}
/* Without rows the loading row is alone: keep it in the flow. */
.qt-loading-row:only-child {
  position: static;
  display: table-row;
}
```

## Filter text without a table

`parseFilterInput(text, column, condition?)` returns the `FilterRule[]` the table emits for `text` typed into the filter of `column`: the same shortcuts (`*a*`, `a*`, `!a`, `a,b`) and the same coercion per column type. Text that gives no rule returns `[]`.

```ts
import { parseFilterInput } from '@dolusoft/query-table'

parseFilterInput('ist*,!*mir', { field: 'city' })
// [{ field: 'city', condition: 'StartsWith', value: 'ist' },
//  { field: 'city', condition: 'NotContains', value: 'mir' }]
```

## Methods

A template ref exposes `focusFilter(field)` (returns `false` when the column has no filter to focus), `expandAll()` and `collapseAll()` (the rows given only; nothing is fetched) and `flushPendingFilters()`.

## Row identity

Pass `row-key` when rows can reorder or change between pages and you use `has-subtable`: the expanded state and the state of the components in the `subtable` slot then follow the row. A string `row-key` is a direct property read (`row[rowKey]`), not a dotted path; for a nested value pass a function, `(row) => row.meta.id`. Keys must be unique. Without `row-key` rows are matched by index and the expanded state resets whenever `rows` changes. With `row-key` only the rows currently in `rows` keep their expanded state: a row that leaves (another page) and comes back is closed.

## Labels

Every text the table writes itself (accessible names of its buttons and filter inputs, the options of a bool filter) comes from the `labels` prop. Give only what you want to change; the rest keeps its English default:

```vue
<QueryTable
  :labels="{
    clearAllFilters: 'Tüm filtreleri temizle',
    filterInput: column => `${column} filtresi`
  }"
  ...
/>
```

## Contract

[`CONTRACT.md`](./CONTRACT.md) is the full public contract: props, events, slots, types, behavior rules and the DOM the table renders. It is generated from the source and checked in CI.

[`PRINCIPLES.md`](./PRINCIPLES.md) lists the boundaries of the package (what it does and never does) and the check that holds each one.

## License

MIT
