# QueryTable and useQueryTable()

Everything here is from `packages/vue/src/contract.ts` and `use-query-table.ts`; `CONTRACT.md` is the full generated list.

## Props that matter

| Prop | Meaning |
| --- | --- |
| `query` (required) | The query, with `v-model:query`. A `CursorQuery` (a `cursor` key) pages by cursor. |
| `columns` (required) | `Column[]`: `field`, `title`, `type`, `width`, `pinned: 'left'`, `resizable`, `minWidth`, `maxWidth`, `hide`, `filterable`, `sortable`. |
| `rows`, `totalRows` | Rows of the current page; the total on the server, `null` when unknown. |
| `sortable`, `filterable`, `resizable` | Turn on the sort buttons, the filter row, the resize handles (each also needs the column to allow it). |
| `filterDebounce` | ms before typed filter text applies (default 100; `0` applies every key). |
| `searchDebounce` | ms before typed search text applies (default 300). |
| `selection` | `v-model:selection`; adds a checkbox column. |
| `cursors` | `{ next, prev }` of the page shown, cursor mode only. |
| `rowKey` | Property name, or `(row, index) => key`. Needed for expansion and selection across pages. |
| `hasSubtable`, `hasRightPanel` | Expand button with the `subtable` slot; a button that emits `rowRightPanelClick`. |
| `loading` | You are fetching: rows stay, `data-loading` and `aria-busy` are set, no empty state. |
| `footerRows`, `pagination`, `labels` | Totals row, pager options, replaceable texts. |

Events: `update:query (query, reason)`, `update:selection`, `rowRightPanelClick`, `cellContextMenu`, `columnResize { field, width }`. The table keeps no width: write `columnResize` back to `Column.width` (`'180px'`), or the column returns to its old width.

Slots: `toolbar`, `filter-menu`, `filter-datetime`, `subtable`, `empty`, `loading`, `pagination`, `header-<field>`, `cell-<field>`. The pager is drawn only when you give the `pagination` slot. A `filter-menu` slot is how a filter button exists at all; its `trigger` component goes in your popover trigger.

Template ref methods: `focusFilter(field)`, `expandAll()`, `collapseAll()`, `flushPendingFilters()`.

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

qt.columns.value // columns to draw, hidden dropped, pinned first
qt.sort.sortBy(column) // a header click
qt.filters.setInput('name', text) // typed filter text, debounced
qt.search.set(text) // typed search, debounced
qt.pagination.value.nextPage()
qt.table // the TanStack table
```

Also on the result: `filters` (`draftOf`, `apply`, `flushAll`, `setCondition`, `clear`, `clearAll`, `canClearAll`, `labelOf`), `expansion`, `selection`, `baseQuery()`. The scope disposal is automatic.

## Styling

No CSS ships and there are no styling props. Select the `qt-*` classes and the `data-*` attributes listed in `contract/dom.ts` (`data-pinned`, `data-sort`, `data-loading`, ...). Two inline styles exist: `width` on a header cell and `--qt-pin-left` on pinned cells; sticky positioning is your CSS. For large tables set `table-layout: fixed` and give every column a `width`.

## Rules to remember

- A page outside `[1, pageCount]` is drawn as given, never corrected (C-01).
- An action whose query equals the current one emits nothing (C-04).
- A pending filter is applied before a page-size change or a sort; a page action is dropped when applying the pending filter changed the filters (C-14).
- If you ignore an emit, the table keeps drawing the old query and the typed text stays (C-19).
- Several rules on a non-text column make its input read-only with a count (C-42).
