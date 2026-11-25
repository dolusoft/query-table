# Moving an AppDataTable page to QueryTable or DataTable

For frontendx developers who move a list drawn with `AppDataTable` (`components/app/data-table/`) to the table of this repository. It maps every prop, slot and event of `AppDataTable` to its counterpart, shows one page before and after, and lists what has no counterpart yet.

## Which component

- **Rows from a server, one page at a time.** The page passes `total` and `loading` and fetches on every change of `page`, `sort` or `search`. Most `AppDataTable` pages are like this. They move to `QueryTable` with `v-model:query`.
- **Every row already in the page.** A short fixed list, drawn with `:pagination="false"`. It moves to `DataTable` from `@dolusoft/query-table/data-table`, which sorts, filters, searches and pages the rows itself ([ADR 0021](../decisions/0021-data-table.md)). It takes the props of `QueryTable`, so everything below holds for it too, without `totalRows` and without a query to wire.

The forms a table takes (pages or a virtual body, one row open or several, selection, grouped rows, no header, loading and empty) are on the playground's **DataTable variations** page (`pnpm dev`, then `#/data-table-variations`), each drawn with `DataTable` and with `QueryTable`.

## The state: five v-models, one query

`AppDataTable` holds its state in five `v-model`s. `QueryTable` holds the page, the page size, the sort and the search in one `query` that the page owns, and emits one `update:query` with a reason for every user action (C-01, C-04); the selection is `v-model:selection`.

| `AppDataTable` | `QueryTable` |
| --- | --- |
| `v-model:page` (1-based) | `query.page` (1-based) |
| `v-model:page-size` | `query.pageSize`; the choices are `pagination.pageSizeOptions` |
| `v-model:sort` (`''`, `'name'`, `'-name'`) | `query.sort` (`null` or `{ field, direction }`) |
| `v-model:search` | `query.search`; the page's input calls `setSearch` of the `toolbar` slot |
| `v-model:selected` (array of keys) | `v-model:selection` (map of key, as a string, to `true`) |

The request the page sends is read off the query. Today `buildPaginationParams` reads it off `queryParams`:

<!-- snippet: app-data-table.ts#request -->
```ts
/** The list request of the page, as `buildPaginationParams` sends it today. */
export interface PaginationRequest {
  SearchText: string
  OrderDirection: 'asc' | 'desc'
  OrderColumnName: string
  /** 0-based. */
  Page: number
  PageSize: number
  FilterColumns: Record<string, unknown>
}

/**
 * `query` is 1-based and holds the sort as an object; the backend name of a
 * field that differs from the column's `field` (the old `sortKey`) comes from
 * `backendNames`. The page's own filters (its toolbar selects) stay outside
 * the query and go in as they are.
 */
export const paginationRequestOf = (
  query: TableQuery,
  filterColumns: Record<string, unknown> = {},
  backendNames: Record<string, string> = {}
): PaginationRequest => ({
  SearchText: query.search ?? '',
  OrderDirection: query.sort?.direction ?? 'desc',
  OrderColumnName: query.sort
    ? (backendNames[query.sort.field] ?? query.sort.field)
    : '',
  Page: query.page - 1,
  PageSize: query.pageSize,
  FilterColumns: filterColumns
})
```

A page that keeps its state in the URL (`useTableQueryParams({ syncUrl: true })`) keeps doing so; the sort travels in the URL as the string it has today:

<!-- snippet: app-data-table.ts#sort -->
```ts
/** The URL form of `v-model:sort` (`''`, `'name'`, `'-name'`) and back. */
export const sortOf = (text: string): SortState | null => {
  if (text === '') {
    return null
  }
  return text.startsWith('-')
    ? { field: text.slice(1), direction: 'desc' }
    : { field: text, direction: 'asc' }
}

export const sortText = (sort: SortState | null): string =>
  sort === null ? '' : `${sort.direction === 'desc' ? '-' : ''}${sort.field}`
```

The bulk actions and the selected count read keys:

<!-- snippet: app-data-table.ts#selection -->
```ts
/**
 * `v-model:selection` is a map from the row key, as a string, to `true`.
 * The page's bulk action and its count read the keys.
 */
export const selectedKeys = (selection: RowSelection): string[] =>
  Object.keys(selection).filter(key => selection[key])

export const selectionOf = (keys: readonly (string | number)[]): RowSelection =>
  Object.fromEntries(keys.map(key => [String(key), true]))
```

Three habits of `AppDataTable` pages change:

- **Assign first, fetch after.** `v-model:query` assigns the emitted query in the same tick; watch `query` and fetch with it. An `await` before the assignment lets the next click build on the old query.
- **The selection outlives a page.** The header checkbox selects the rows of the page and keeps the keys of other pages (C-64). A page that clears the selection when the query changes (`clearSelectionOnQueryChange`) does it in its `update:query` handler.
- **The page's own filters stay the page's.** The selects in `#toolbar-end` are not part of `query`; when one changes, the page sets `query.page` to `1` itself, as it does today. The table's own filter row (`filterable`) is off unless you turn it on.

## Before and after

The administrators page, abridged. The Vue below is not compiled; the TypeScript above is ([`examples/app-data-table.ts`](examples/app-data-table.ts)).

Before:

```vue
<AppDataTable
  v-model:selected="selectedRowsId"
  v-model:sort="queryParams.sort"
  v-model:page="queryParams.page"
  v-model:page-size="queryParams.pageSize"
  v-model:search="queryParams.search"
  :rows="itemList"
  :columns="columns"
  :total="itemTotal"
  :loading="itemLoading"
  row-key="id"
  :selectable="true"
  :load-error="listLoadError"
  :empty-title="t('no-matches')"
  :crud-hints="crudHints"
  table-id="admin-table"
>
  <template #toolbar-actions>…delete and add buttons…</template>
  <template #toolbar-end>…user type and status selects…</template>
  <template #cell-username="{ row }">
    <div class="dt-stack">
      <strong>{{ row.username }}</strong>
      <small>{{ row.description }}</small>
    </div>
  </template>
</AppDataTable>
```

After:

```vue
<script setup lang="ts">
import { CellStack } from '@dolusoft/query-table/cells'
import { QueryTable, type RowSelection, type TableQuery } from '@dolusoft/query-table'

const query = ref<TableQuery>({ page: 1, pageSize: 10, sort: null, filters: [] })
const selection = ref<RowSelection>({})
watch(query, next => fetchList(paginationRequestOf(next, { ...filterState })))
</script>

<template>
  <QueryTable
    v-model:query="query"
    v-model:selection="selection"
    :rows="itemList"
    :columns="columns"
    :total-rows="itemTotal"
    :loading="itemLoading"
    row-key="id"
    sortable
    :pagination="{ pageSizeOptions: [10, 25, 50] }"
    data-cy="admin-table"
  >
    <template #toolbar="bar">
      <input type="search" :value="bar.search" @input="bar.setSearch($event.target.value)" />
      …user type and status selects, delete and add buttons…
    </template>
    <template #cell-username="{ row }">
      <CellStack :primary="row.username" :secondary="row.description" />
    </template>
    <template #loading>…skeleton…</template>
    <template #empty>…load error, "no matches" or the add hint…</template>
    <template #pagination="page">…the page's pager…</template>
  </QueryTable>
</template>
```

The table draws no toolbar, no pager and no empty-state text of its own (P13): those are the page's markup in the slots, so the components that draw them today keep drawing them.

## Props

| `AppDataTable` | `QueryTable` |
| --- | --- |
| `rows`, `rowKey` | `rows`, `rowKey` (a property name or a function) |
| `columns` | `columns`; see [Columns](#columns) |
| `total` | `totalRows` |
| `loading` | `loading`; the rows stay drawn and the `loading` slot draws a row for a skeleton (C-52) |
| `selectable` | `v-model:selection` |
| `rowSelectable` (`row => boolean`) | `rowSelectable` (`(row, index) => boolean`): the row's checkbox is `disabled` and the header checkbox leaves the row out; the key of such a row stays in `selection` when it is there, so the bulk action leaves it out itself (C-130) |
| `expandable` | `hasSubtable`, with the `subtable` slot |
| `expandMode` (default `'single'`) | `expandMode` (default `'multiple'`): pass `'single'` to keep the accordion (C-123) |
| `getChildren`, `rowHasChildren`, `rowIsCycle` | no counterpart: deferred ([#226](https://github.com/dolusoft/query-table/issues/226)); the page can flatten the tree into `rows`, see [No counterpart yet](#no-counterpart-yet) |
| `reorderable` | `rowReorderable`, with `rowKey`: a handle in the first utility column of every row that is not pinned, moved by a drag or by ↑ ↓ Home End (C-133). Keep turning it on only while the rows are sorted by their order and no search hides one, as the pages do with `canReorder` |
| `searchable`, `searchPlaceholder`, `searchPosition` | the page's input in the `toolbar` slot |
| `searchDebounceMs` (300) | `searchDebounce` (300) |
| `pageSizes` | `pagination.pageSizeOptions` |
| `showFooter`, `pagination` | the `pagination` slot; leave it out for no footer. `DataTable` takes `paginate: false` |
| `virtualScroll`, `rowHeight` | `virtual` (`true`, or `{ rowHeight }` / `{ estimateRowHeight }`), in a scroll box with `table-layout: fixed` (C-83, C-85) |
| `maxHeight` | the page's CSS around the table (P13); `scrollBody` scrolls the body under the header (C-101) |
| `stickyHeader` | the page's CSS, or `scrollBody` |
| `hoverable`, `striped` | the skin's CSS |
| `emptyTitle`, `emptySubtitle`, `crudHints`, `filtersActive`, `loadError` | the `empty` slot: the page knows its filters, its load error and its add action |
| `tableId` | attributes reach the table's root: `data-cy="admin-table"` |
| `rowClass` | `rowKind`: written as `data-row-kind` for the CSS (C-97) |
| `title`, `showTotal` | the page's markup above the table, or the `toolbar` slot |
| `details`, `detailsStart`, `detailsEnd` | no direct counterpart; see [No counterpart yet](#no-counterpart-yet) |

## Columns

| `DataTableColumn` | `Column` |
| --- | --- |
| `key` | `field` |
| `label` | `title` |
| `sortable` | the table's `sortable` sorts every column; `sortable: false` leaves one out |
| `sortKey` | the request: the third argument of `paginationRequestOf` |
| `width` | `width` |
| `minWidth` (CSS) | the page's CSS on `th[data-field="…"]`; `Column.minWidth` is the floor of a resize, in pixels (C-49) |
| `align` | `type: 'number'` or `'integer'` aligns to the end in the skin; otherwise CSS on `[data-field="…"]` |
| `cellClass`, `headerClass` | CSS on `td[data-field="…"]` and `th[data-field="…"]`: the table takes no styling props (P5) |
| `spanDetails` | belongs to the details band |
| `terminalValue` | not the table's: it stays where the terminal reads it |

`Column.type` (`string`, `number`, `integer`, `date`, `datetime`, `bool`) has no `AppDataTable` counterpart: it sets the alignment hook `data-type` and, with `filterable`, the grammar of the column's filter (C-39, C-82).

## Slots, events and methods

| `AppDataTable` | `QueryTable` |
| --- | --- |
| `#cell-{key}` | `#cell-<field>` |
| `#header-{key}` | `#header-<field>` |
| `#expanded` | `#subtable` |
| `#empty` | `#empty` |
| `#toolbar-search`, `#toolbar-start`, `#toolbar-actions`, `#toolbar-end`, `#tabs` | one `#toolbar` slot, or the page's markup above the table |
| `#footer-end` | inside the page's `#pagination` slot |
| `#leading-cell` | no slot: `rowKind` and CSS on the first cell |
| `#detail-{key}` | belongs to the details band |
| `@row-click` | no row event: a link or button in a cell slot opens the row; `rowNavigation` moves between rows with the keyboard (C-109) |
| `@row-expand(row, expanded)` | `@row-expansion-change({ row, rowIndex, rowKey, expanded })` (C-122) |
| `@row-reorder(items, { oldIndex, newIndex, movedItem })` | `@row-reorder({ row, rowIndex, rowKey, target, place })` (C-133): the moved row and the key of the row it goes `before` or `after`, no index. The table moves no row; build the new order of the page from the keys and pass it as `rows`, as `items` was |
| `expandRows(rows)` | `expandAll()` and `collapseAll()`; the open branches of a flattened tree are the page's state ([No counterpart yet](#no-counterpart-yet)) |

## No counterpart yet

- **Tree rows** (`getChildren`): deferred ([#226](https://github.com/dolusoft/query-table/issues/226), D-01). Its one use, the schema table of the API reference panel, stays on `AppDataTable`; the decision is looked at again when a second page needs tree rows, or when that table needs something only `QueryTable` has. A page can draw a tree today by flattening it into `rows`:
  - the children of an open row come right after it, and each row carries its depth;
  - a `cell-<field>` slot draws the indent and the open and close button;
  - the set of open rows is the page's state.

  The columns stay aligned, unlike a `QueryTable` in the `subtable` slot. What it lacks is accessibility: the table writes no `aria-level` and does not present itself as a `treegrid`, so a screen reader does not hear a row's level.
- **The details band** (`details`): a strip of `Label: value` under every row, always open. The nearest forms are a second line in the cell (`CellStack`'s `secondary`) or a `subtable` that starts open (`isExpanded: true`), which draws an expand button as well.
- **A row click** (`@row-click`): a link or button in a cell is the way; the table cancels no click and emits no row event (C-27).

A page that needs one of these and has no way around it stays on `AppDataTable` until its issue gives it a counterpart.

## The look

The reference skin is the product's table design as one stylesheet, for `QueryTable`, `DataTable` and the cell components. It comes with `@dolusoft/query-table`: import `@dolusoft/query-table/table.css` once. Its `--qt-*` tokens map the design system's colors and sizes ([Reference skin](../../README.md#reference-skin); the tokens in [`packages/vue/etc/tokens.md`](../../packages/vue/etc/tokens.md)). The two-line, copy, badge and action cells of `AppDataTable` pages have counterparts in `@dolusoft/query-table/cells` (ADR 0022).
