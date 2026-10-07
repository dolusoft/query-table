# QueryTable and useQueryTable()

Everything here is from `packages/vue/src/contract.ts` and `use-query-table.ts`; `CONTRACT.md` is the full generated list.

## Props that matter

| Prop | Meaning |
| --- | --- |
| `query` (required) | The query, with `v-model:query`. A `CursorQuery` (a `cursor` key) pages by cursor. |
| `columns` (required) | `Column[]`: `field`, `title`, `type`, `width`, `pinned: 'left' \| 'right'`, `resizable`, `minWidth`, `maxWidth`, `hide`, `filterable`, `sortable`. With `v-model:columns` when the user may change the layout. |
| `rows`, `totalRows` | Rows of the current page; the total on the server, `null` when unknown. |
| `sortable`, `filterable`, `resizable` | Turn on the sort buttons, the filter row, the resize handles (each also needs the column to allow it). |
| `filterDebounce` | ms before typed filter text applies (default 100; `0` applies every key). |
| `searchDebounce` | ms before typed search text applies (default 300). |
| `selection` | `v-model:selection`; adds a checkbox column. |
| `cursors` | `{ next, prev }` of the page shown, cursor mode only. |
| `rowPinning` | `v-model:rowPinning`: `{ top, bottom }` row keys pinned to the top or the bottom of the page. Needs `rowKey`. |
| `rowKey` | Property name, or `(row, index) => key`. Needed for expansion and selection across pages, and for row pinning. |
| `hasSubtable`, `hasRightPanel` | Expand button with the `subtable` slot; a button that emits `rowRightPanelClick`. |
| `loading` | You are fetching: rows stay, `data-loading` and `aria-busy` are set, no empty state. |
| `footerRows`, `pagination`, `labels` | Totals row, pager options, replaceable texts. |

Events: `update:query (query, reason)`, `update:selection`, `update:columns (columns, reason)`, `update:rowPinning`, `rowRightPanelClick`, `cellContextMenu`, `columnResize { field, width }`. The table keeps no width: write `columnResize` back to `Column.width` (`'180px'`), or the column returns to its old width; with `v-model:columns` the `update:columns` that follows does it for you.

Slots: `toolbar`, `filter-menu`, `filter-datetime`, `subtable`, `empty`, `loading`, `pagination`, `header-<field>`, `cell-<field>`. The pager is drawn only when you give the `pagination` slot. A `filter-menu` slot is how a filter button exists at all; its `trigger` component goes in your popover trigger.

Template ref methods: `focusFilter(field)`, `expandAll()`, `collapseAll()`, `flushPendingFilters()`.

## Column layout

Your `columns` owns the layout: `hide`, the order of the array and `pinned: 'left' | 'right'`. The `header-<field>` and `filter-menu` slots receive `control`: `pinned`, `pin(side)` (`'left'`, `'right'` or `false`), `hide()`, `canMoveLeft`, `canMoveRight` and `move('left' | 'right')`. Each action emits `update:columns (columns, reason)` once, `reason` being a `ColumnChangeReason`: `visibility`, `order`, `pin` or `resize`. The array is new, a changed column is a new object with your other fields kept, the others are your objects, and a default is removed (`hide`, `pinned`), never written as `false`.

```vue
<script setup lang="ts">
const columns = shallowRef<Column[]>(initialColumns)
</script>

<QueryTable v-model:query="query" v-model:columns="columns" ...>
  <template #filter-menu="menu">
    <button @click="menu.control.pin(menu.control.pinned ? false : 'left')">Pin</button>
    <button :disabled="!menu.control.canMoveLeft" @click="menu.control.move('left')">←</button>
    <button @click="menu.control.hide()">Hide</button>
  </template>
</QueryTable>
```

- A consumer that does not write back sees the old layout, and nothing is emitted on mount or when you change `columns` yourself.
- Moving stays inside the column's region (pinned left, not pinned, pinned right); changing the region is pinning.
- With `reorderable` every header cell starts with a `button.qt-reorder-handle` (opt a column out with `reorderable: false`, name it with `labels.moveColumn`). Drag it, or focus it and press ArrowLeft/ArrowRight (one position), Home or End (the region's ends): one `update:columns` with reason `order` per drop or key. While dragging, the table only sets `data-dragging` on the dragged header and `data-drop="before|after"` on the target; Escape cancels. Give the handle `touch-action: none` in your CSS. The focus stays on the moved handle after you write back; the table draws no live region, so announce the new position from `update:columns` yourself.
- Showing a hidden column again is yours: write `columns` without `hide` from your own column picker.
- Keep `columns` in a `shallowRef`: the table emits a new array for every change, so nothing needs to watch its inside.
- The sides are physical (`left`, `right`): an LTR layout is assumed.
- None of these emits `update:query`.

For a source with all rows already loaded, see [local query evaluation](local-query.md) (`useLocalQuery` from the opt-in `/local` entry).

## Page mode, with a pager

```vue
<QueryTable v-model:query="query" :columns="columns" :rows="rows" :total-rows="total" sortable filterable>
  <template #pagination="{ page, pageCount, canPrevious, canNext, previousPage, nextPage }">
    <button :disabled="!canPrevious" @click="previousPage()">Previous</button>
    {{ page }} / {{ pageCount }}
    <button :disabled="!canNext" @click="nextPage()">Next</button>
  </template>
</QueryTable>
```

## Cursor mode

```ts
import type { CursorQuery, PageCursors } from '@dolusoft/query-table'

const query = ref<CursorQuery>({ cursor: null, pageSize: 20, sort: null, filters: [] })
const cursors = ref<PageCursors>({ next: null, prev: null })
```

```vue
<QueryTable v-model:query="query" :cursors="cursors" :total-rows="null" ... />
```

`nextPage` and `previousPage` emit reason `page` with the cursor of that side and do nothing without one; `setPage` does nothing. `prev` may come from your server or from your own stack of visited tokens; the table cannot tell.

## Search and selection

```vue
<QueryTable v-model:query="query" v-model:selection="selected" row-key="id" :search-debounce="300" ...>
  <template #toolbar="{ search, setSearch, applySearch }">
    <input :value="search" aria-label="Search"
      @input="setSearch(($event.target as HTMLInputElement).value)"
      @keydown.enter="applySearch()" />
  </template>
</QueryTable>
```

`selected` is `Record<string, boolean>`; keys of rows on other pages stay in it.

## Row pinning

```vue
<QueryTable v-model:query="query" v-model:rowPinning="pinning" row-key="id" ...>
  <template #cell-name="{ row, rowPinned, pinRow }">
    {{ row.name }}
    <button type="button" @click="pinRow(rowPinned === 'top' ? false : 'top')">Pin</button>
  </template>
</QueryTable>
```

`pinning` is `{ top: string[]; bottom: string[] }`, row keys (`rowKey` as a string) in the order they were pinned. The rows of `rows` in `top` are drawn first and those in `bottom` last, with `data-pinned-row="top|bottom"` (on the subtable row too); `data-row-index` stays the index in `rows`. `pinRow(position)` from a `cell-<field>` slot emits `update:rowPinning` once (`false` unpins; the position the row has emits nothing). Limits (C-74):

- Without `rowKey` the prop is ignored and `pinRow` does nothing.
- Keys of rows on other pages stay in the map and are not drawn: the table never asks for a row. To show a pinned row on every page, add it to `rows` yourself, once per key.
- With an unknown total (`totalRows: null`) such an added row counts for `canNext` (C-23): a page that is full only because of it shows a next page.
- The rows stay in the flow; sticky top or bottom rows are your CSS.

## useQueryTable()

`QueryTable` is a thin view over it. Options take refs or getters; `onQueryChange(query, reason)` is called once per user action.

```ts
import { ref } from 'vue'
import { useQueryTable, type TableQuery } from '@dolusoft/query-table'

const query = ref<TableQuery>({ page: 1, pageSize: 10, sort: null, filters: [] })
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

qt.columns.value // columns to draw, hidden dropped, pinned left first, pinned right last
qt.layout.controlOf('name').hide() // calls onColumnsChange(columns, 'visibility')
qt.sort.sortBy(column) // a header click
qt.filters.setInput('name', text) // typed filter text, debounced
qt.search.set(text) // typed search, debounced
qt.pagination.value.nextPage()
qt.table // the TanStack table
```

Also on the result: `filters` (`draftOf`, `apply`, `flushAll`, `setCondition`, `clear`, `clearAll`, `canClearAll`, `labelOf`), `layout` (`controlOf`, `regionOf`, `moveColumn`; give `onColumnsChange(columns, reason)` to receive them), `expansion`, `selection`, `rowPinning` (`enabled`, `rows` in drawing order, `pin(row, index, position)`; give `rowPinning` and `onRowPinningChange(map)`), `baseQuery()`. The scope disposal is automatic.

## Styling

No CSS ships and there are no styling props. Select the `qt-*` classes and the `data-*` attributes listed in `contract/dom.ts` (`data-pinned`, `data-sort`, `data-loading`, ...). Three inline styles exist: `width` on a header cell, `--qt-pin-left` on cells pinned to the left and `--qt-pin-right` on cells pinned to the right (`data-pinned="right"`); sticky positioning is your CSS. One rule serves both sides, since the unset property leaves the other side `auto` (LTR layout): `.qt-table [data-pinned] { position: sticky; left: var(--qt-pin-left); right: var(--qt-pin-right) }`. The utility cells are pinned only with a column pinned to the left. Every header, body and footer cell of a column carries `data-type` (`string`, `number`, `integer`, `date`, `datetime`, `bool`; C-82); alignment is yours, by it: `.qt-table :is([data-type='number'], [data-type='integer']) { text-align: end; font-variant-numeric: tabular-nums }`. For large tables set `table-layout: fixed` and give every column a `width`.

## Rules to remember

- A page outside `[1, pageCount]` is drawn as given, never corrected (C-01).
- An action whose query equals the current one emits nothing (C-04).
- A pending filter is applied before a page-size change or a sort; a page action is dropped when applying the pending filter changed the filters (C-14).
- If you ignore an emit, the table keeps drawing the old query and the typed text stays (C-19).
- Several rules on a non-text column make its input read-only with a count (C-42).
