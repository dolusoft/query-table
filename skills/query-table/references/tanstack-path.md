# The TanStack path

Use `@dolusoft/query-table-core` with TanStack Table v9 when you draw the table yourself. Add `@dolusoft/query-table-core` and `@dolusoft/query-protocol` to your dependencies (you import them directly) next to TanStack, which is pinned to an exact version by the core.

The playground page `TanStack path` (`apps/playground/examples/TanstackPath.vue`) is a working example; `docs/guide/tanstack-plugins.md` is the guide.

## Setup (Vue)

```ts
import {
  dispose,
  filterInputFeature,
  projectServerQuery,
  serverQueryFeature
} from '@dolusoft/query-table-core'
import {
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable
} from '@tanstack/vue-table'

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  serverQueryFeature,
  filterInputFeature
})

// The query as TanStack's slices (sorting, columnFilters, pagination, globalFilter).
const projection = computed(() =>
  projectServerQuery({
    query: query.value,
    rowCount: result.value.totalRows,
    pageRows: result.value.rows.length
  })
)

const table = useTable<typeof features, Row>({
  features,
  columns: [
    { id: 'name', accessorKey: 'name', header: 'Name' },
    { id: 'age', accessorKey: 'age', header: 'Age', filterType: 'integer' }
  ],
  get data() { return result.value.rows },
  get query() { return query.value },
  onQueryChange: next => { query.value = next },
  get rowCount() { return result.value.totalRows },
  get pageCount() { return projection.value.pageCount },
  enableSorting: true,
  state: {
    get sorting() { return projection.value.state.sorting },
    get columnFilters() { return projection.value.state.columnFilters },
    get pagination() { return projection.value.state.pagination },
    get globalFilter() { return projection.value.state.globalFilter }
  }
})

onScopeDispose(() => dispose(table))
```

The TanStack state slices are a projection of the query you own; never keep a second copy of them (P15).

## What you get

- `column.toggleQuerySorting()`: asc, desc, none, built on the base query, so two calls in one tick are two steps. Use it instead of `toggleSorting()`.
- `table.getBaseQuery()`: the last unanswered update of this tick, else the query shown.
- Filter input (from `filterInputFeature`): `column.getFilterInput()`, `column.setFilterInput(text)`, `column.applyFilterInput()` (Enter), `column.setFilterCondition(condition | null)`, `column.clearFilterInput()`, `column.getFilterLabel()`, `table.flushPendingFilters()`, `table.clearAllFilters()`, `table.getCanClearAllFilters()`. Column option `filterType` picks the grammar (`string`, `number`, `integer`, `date`, `datetime`, `bool`). Table option `filterDebounce` (default 100).
- Paging: use TanStack's `table.nextPage()`, `previousPage()`, `setPageSize()`; the plugin turns them into one update. In cursor mode pass `cursors: { next, prev }`.
- Search: set TanStack's global filter; the plugin emits a `search` update.

## Rules of the road

- The plugin owns `onSortingChange`, `onColumnFiltersChange`, `onPaginationChange`, `onGlobalFilterChange`, `manualSorting`, `manualFiltering`, `manualPagination` (all true), `sortDescFirst: false` and `enableMultiSort: false`. Options that replace them make the table throw at construction (C-61).
- A plugin never imports another plugin; they are independent. Use only the one you need through `@dolusoft/query-table-core/server-query` or `/filter-input`.
- Call `dispose(table)` when the table goes away: it clears pending debounce timers and makes the table inert (C-62).
- Row selection stays TanStack's, controlled: pass `state.rowSelection` and handle `onRowSelectionChange`.
- Column filter value is the field's `FilterRule[]` and the `filterFn` is a no-op: the server filters.
