# Query Table

A thin Vue 3 table for server-side data. It renders the rows you give it and tells you, through `v-model:query`, what the user asked for: a page, a page size, a sort or a filter. Fetching and ordering the data is up to you.

The table ships no CSS. It renders plain markup with a small, stable set of `qt-` classes and `data-*` attributes; style them with your own design system.

![Query Table v3 architecture: the Vue package on the core features, the core on the protocol and TanStack Table, and the two consumer paths](apps/playground/public/architecture.svg)

Three packages: `@dolusoft/query-protocol` (the query types, the filter grammar and the JSON Schema; no dependencies), `@dolusoft/query-table-core` (two TanStack Table features: `serverQueryFeature` keeps TanStack's state and the query in step, `filterInputFeature` turns typed filter text into rules) and `@dolusoft/query-table` (the Vue component and `useQueryTable()`). A consumer either uses the component or builds its own markup on TanStack Table with the two features ([advanced usage](#advanced-usage-usequerytable)).

## Install

The three packages are released together on npm. Add the Vue package by name and version; the protocol and the core come with it as dependencies:

```bash
pnpm add @dolusoft/query-table@3.1.0
```

A TanStack consumer without the component installs only the protocol and the core. Peer dependency: `vue` 3.5+. The package is ESM only (`import`; Node 22.12+ also loads it with `require`) and needs Node 22.12 or newer (`engines`). Working on the package itself needs Node 24 (`devEngines`).

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

## Applying the query

Take the emitted query into your own copy in the same tick, and fetch with it afterwards: that is what `v-model:query` does. The table remembers its last emit only until the tick ends; after that every action builds on the `query` you hold. A consumer that applies an emit late (after an `await`, say) makes the next click build on the old query and lose the change before it. A consumer that ignores an emit is fine: the table keeps drawing the old query and the typed filter text stays (C-19).

```ts
// Do: update the model at once, fetch next.
function onUpdate(next: TableQuery) {
  query.value = next
  void load(next)
}
```

## Sorting

A header click cycles ascending, descending, none: the third click on the same column sets `sort` to `null`. A click on another column starts at ascending. The sort is a single `{ field, direction }`, so "none" is the absence of the entry.

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

Set `pinned: 'left'` on a column. Pinned columns are drawn first, in their declared order, and when any column is pinned to the left the utility cells (expand, select) are pinned too. The table marks every pinned `th` and `td` with `data-pinned` and writes its left offset, measured from the rendered widths, as the inline custom property `--qt-pin-left`. `pinned: 'right'` draws a column last instead, marks its cells `data-pinned="right"` and writes `--qt-pin-right`, the measured widths of the right-pinned cells after it. Making the cells stick is your CSS; one rule serves both sides, since the unset property leaves the other side `auto` (an LTR layout is assumed):

```css
.qt-table [data-pinned] {
  position: sticky;
  left: var(--qt-pin-left);
  right: var(--qt-pin-right);
  z-index: 1;
  background: white; /* opaque, so scrolled cells pass underneath */
}
.qt-table:has([data-pinned]) {
  border-collapse: separate; /* collapsed borders leave gaps at sticky edges */
  border-spacing: 0;
}
```

A row of the `subtable` slot is one cell over every column (`tr.qt-subtable-row > td[colspan]`), so it scrolls sideways with the table and its content can leave the view. The table does not pin it. `position: sticky` on that `td` does nothing, because the cell is as wide as the table; stick a wrapper inside the slot instead, as wide as the visible part. Make the scroller a size container and size the wrapper with `cqw`:

```css
.qt-table-responsive {
  container-type: inline-size;
}
.subtable-content {
  position: sticky;
  left: 0.5rem; /* the cell's padding */
  width: calc(100cqw - 1rem); /* the visible width minus both paddings */
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

where `columns` turns each saved number into `Column.width` (for example `'180px'`). Use `table-layout: fixed` (see Large tables) so the header width is the column width; with the automatic layout the content can override it. Style the handle with your CSS: `position: absolute` over the right edge of a `position: relative` `th`, about 8px wide for the pointer, drawing nothing at rest and a 1px line on header hover and on `:focus-visible`.

A right-pinned column stays at the right edge and grows to the left, so its handle stands for its left edge: dragging it to the left and ArrowLeft widen the column. Put that handle over the cell's left edge, and keep the handle of the cell before the first right-pinned one inside its own cell, so the two do not overlap:

```css
.qt-table th[data-pinned='right'] > .qt-resize-handle {
  right: auto;
  left: -0.75rem;
}
.qt-table th:has(+ th[data-pinned='right']):not([data-pinned]) > .qt-resize-handle {
  right: 0;
  z-index: 0; /* below the pinned cells' z-index (1 above) */
}
```

Together with the sizing above:

```css
.qt-table {
  table-layout: fixed;
  width: max-content;
  min-width: 100%;
}
```

## Reordering columns

With `reorderable` every header cell starts with a `qt-reorder-handle` button (opt a column out with `reorderable: false`). Drag it onto another header of the same region (pinned left, not pinned, pinned right), or focus it and press ArrowLeft or ArrowRight to move one position, Home or End to go to the ends of the region; Escape cancels a drag. The table emits `update:columns` with reason `order` and draws the new order once you write it back (`v-model:columns`); the focus stays on the moved handle. While dragging, the dragged header carries `data-dragging` and the target `data-drop="before"` or `"after"`: draw the indicator with your CSS, and give the handle `touch-action: none` so a touch drag does not scroll the page. The table announces nothing: say the new position from your `update:columns` listener.

Known limits: the drop targets are measured when the drag starts, so scrolling the table sideways during a drag is not followed (release, scroll, drag again); and the table does not scroll by itself when the pointer nears its edge. The keys have neither limit.

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

## Search

The `toolbar` slot gets the global search: `search` (the text to show), `setSearch(text)` for each key and `applySearch()` for Enter. Typed text is applied `search-debounce` milliseconds after the last key (default `300`), as one `search` update that goes back to the first page; blank text applies at once. The server decides what `query.search` matches. If you debounce on your own, pass `:search-debounce="0"` so the text is not debounced twice (C-58, C-63).

```vue
<QueryTable v-model:query="query" :search-debounce="300" ...>
  <template #toolbar="{ search, setSearch, applySearch }">
    <input
      :value="search"
      aria-label="Search"
      @input="setSearch(($event.target as HTMLInputElement).value)"
      @keydown.enter="applySearch()"
    />
  </template>
</QueryTable>
```

## Row selection

Pass `v-model:selection` (a map of row key to `true`) and the table draws a column of checkboxes, with a select-all box for the page. The selection is yours: the table emits the new map and draws what you pass back, keys of other pages included. Give `row-key` so a key names the same row on every page (C-59, C-64).

## Cursor paging

A query with a `cursor` key pages by cursor: `cursor: null` asks for the first page, `{ token, direction }` for the page on that side of the one shown. Pass the cursors of the page shown as `:cursors="{ next, prev }"` (`null` where there is no page) and `:total-rows="null"` when the total is unknown. The `pagination` slot then gets `cursorMode: true`; a sort, a filter, a search or a new page size goes back to `cursor: null` (C-56, C-57, C-65).

```ts
import type { CursorQuery, PageCursors } from '@dolusoft/query-table'

const query = ref<CursorQuery>({ cursor: null, pageSize: 20, sort: null, filters: [] })
const cursors = ref<PageCursors>({ next: null, prev: null })
```

## Filter text without a table

`parseFilterInput(text, column, condition?)` returns the `FilterRule[]` the table emits for `text` typed into the filter of `column`: the same shortcuts (`*a*`, `a*`, `!a`, `a,b`) and the same coercion per column type. Text that gives no rule returns `[]`.

```ts
import { parseFilterInput } from '@dolusoft/query-table'

parseFilterInput('ist*,!*mir', { field: 'city' })
// [{ field: 'city', condition: 'StartsWith', value: 'ist' },
//  { field: 'city', condition: 'NotContains', value: 'mir' }]
```

## Advanced usage: `useQueryTable()`

`QueryTable` is a thin view over `useQueryTable()`. Call the composable yourself to draw your own markup with the same behavior: it takes the props as refs or getters, calls `onQueryChange(query, reason)` once per user action and returns the state and actions to draw from, plus the TanStack `table`. It is disposed with the component's scope.

```ts
import { ref } from 'vue'
import { useQueryTable, type TableQuery } from '@dolusoft/query-table'

const query = ref<TableQuery>({ page: 1, pageSize: 10, sort: null, filters: [] })
const rows = ref<{ name: string }[]>([])
const total = ref(0)
const qt = useQueryTable({
  query,
  columns: [{ field: 'name', title: 'Name', sortable: true }],
  rows,
  totalRows: total,
  sortable: true,
  onQueryChange: next => {
    query.value = next
  }
})

qt.columns.value // the columns to draw, pinned first
qt.sort.sortBy(column) // a header click
qt.filters.setInput('name', text) // typed filter text, debounced
qt.search.set(text) // typed search, debounced
qt.pagination.value.nextPage() // what the pagination slot gets
```

Without Vue's component layer at all, use TanStack Table with the two core features: `serverQueryFeature` owns TanStack's sorting, filter and pagination handlers and turns each change into one query update, and `filterInputFeature` adds the typed filter text. Import them from `@dolusoft/query-table-core` and the query types from `@dolusoft/query-protocol`; add both packages to your dependencies, since you import them directly. The playground's "TanStack path" page is a working example.

## Methods

A template ref exposes `focusFilter(field)` (returns `false` when the column has no filter to focus), `expandAll()` and `collapseAll()` (the rows given only; nothing is fetched) and `flushPendingFilters()`.

## Row identity

Pass `row-key` when rows can reorder or change between pages and you use `has-subtable`: the expanded state and the state of the components in the `subtable` slot then follow the row. A string `row-key` is a direct property read (`row[rowKey]`), not a dotted path; for a nested value pass a function, `(row) => row.meta.id`. Keys must be unique. Without `row-key` rows are matched by index and the expanded state resets whenever `rows` changes. With `row-key` only the rows currently in `rows` keep their expanded state: a row that leaves (another page) and comes back is closed.

A row may carry an `isExpanded` boolean to start open or closed (a print or report view opens every row this way): each time `rows` changes, `true` opens the row, `false` closes it and a row without the field keeps its state. It is a seed, not a binding: the table never writes it back, and the user's toggles stand until `rows` changes again.

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

## Guides

The v3 guides (protocol, TanStack plugins, architecture, migration) are in [`docs/guide/`](./docs/guide/README.md).

## Contract

[`CONTRACT.md`](./CONTRACT.md) is the full public contract: props, events, slots, types, behavior rules and the DOM the table renders. It is generated from the source and checked in CI.

[`PRINCIPLES.md`](./PRINCIPLES.md) lists the boundaries of the package (what it does and never does) and the check that holds each one.

## License

MIT
