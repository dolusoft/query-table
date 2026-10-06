# Using the plugins with TanStack Table

`@dolusoft/query-table-core` is the headless core of Query Table: two [TanStack Table](https://tanstack.com/table) v9 plugins that turn what the user does (sort, page, filter, search) into **query updates the consumer owns**. Use them directly when you draw the table yourself, with your own markup or with a design system's table, and want the same behavior as the `QueryTable` component without it.

There is no framework in this package and no DOM. The examples on this page use `@tanstack/table-core`; a framework adapter passes the same options (the Vue package's own API is described with the Vue package).

- `serverQueryFeature`: TanStack's sort, page, column filter and global filter state ↔ one `Query` ([the protocol](protocol.md)).
- `filterInputFeature`: the text typed into each column's filter, parsed with the protocol's grammar, debounced and applied as filter rules.

Both are optional and independent ([architecture](architecture.md)). The package is released with the other two, from 3.0.0, and it depends on `@tanstack/table-core` at an exact version (9.2.6): install that one next to it.

## Setup

Register the TanStack features you need next to the two plugins. The plugins take over the `on*Change` handlers of sorting, pagination, column filters and the global filter, so register the stock features whose state you want to use:

<!-- snippet: table.ts#imports -->
```ts
import type { PageCursors, Query } from '@dolusoft/query-protocol'
import {
  filterInputFeature,
  projectServerQuery,
  serverQueryFeature
} from '@dolusoft/query-table-core'
import {
  columnFilteringFeature,
  constructTable,
  globalFilteringFeature,
  rowPaginationFeature,
  type RowSelectionState,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'
```

<!-- snippet: table.ts#features -->
```ts
// TanStack's own features do the stock work; the two plugins sit on top. A
// feature the table does not need (here none) is simply left out.
const features = tableFeatures({
  coreReactivityFeature: storeReactivityBindings(),
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSelectionFeature,
  serverQueryFeature,
  filterInputFeature
})

const columns = [
  { id: 'name', accessorKey: 'name' as const },
  { id: 'age', accessorKey: 'age' as const, filterType: 'number' as const },
  { id: 'joined', accessorKey: 'joined' as const, filterType: 'date' as const },
  { id: 'active', accessorKey: 'active' as const, filterType: 'bool' as const }
]
```

The plugins add typed options, state and APIs to the table through TanStack's declaration merging, so no cast is needed anywhere. The entry points are `@dolusoft/query-table-core` (both plugins, the projection helpers and `dispose`), and `@dolusoft/query-table-core/server-query` and `@dolusoft/query-table-core/filter-input` for one plugin each.

### Options

| Option                         | Plugin        | Meaning                                                                                                  |
| ------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------- |
| `query`                        | server-query  | The query the table shows. You own it (controlled).                                                      |
| `onQueryChange(query, reason)` | server-query  | Called once per user action that changes the query, with a **new object** and the reason.                |
| `cursors`                      | server-query  | Cursor mode: the `{ next, prev }` cursors your server answered with for the page shown.                  |
| `filterDebounce`               | filter-input  | Milliseconds between the last keystroke and applying the text. Defaults to 100, `0` applies each keystroke. |
| column `filterType`            | filter-input  | The column's data type (`'string'` by default); it picks the grammar and the default condition.          |

`rowCount` and `pageCount` are TanStack's own options; the projection below computes `pageCount` for you.

## The controlled loop

The consumer owns the query. TanStack's `sorting`, `columnFilters`, `pagination` and `globalFilter` slices are not state of their own here: they are a **projection** of your `query`, handed to the table whenever it changes. The table never writes to them; it calls `onQueryChange` and waits for you to pass the new query back.

<!-- snippet: table.ts#loop -->
```ts
let query = initial
let rows: Person[] = []
let total: number | undefined
let cursors: PageCursors | null = null
let selection: RowSelectionState = {}
const updates: Array<[Query, string]> = []

/** Tells the table what the consumer holds now (the "adapter" step). */
const render = () => {
  const { state, pageCount } = projectServerQuery({
    query,
    rowCount: total,
    cursors,
    pageRows: rows.length
  })
  table.setOptions(old => ({
    ...old,
    data: rows,
    query,
    rowCount: total,
    cursors,
    pageCount,
    // The slices the query owns come from the projection; the others
    // (row selection) are the consumer's own.
    state: { ...state, rowSelection: selection }
  }))
}

/** Fetches with the query given, then shows the answer. */
const load = (next: Query) => {
  const result = answer(next)
  rows = result.rows
  if ('cursors' in result) {
    cursors = result.cursors
  } else {
    total = result.total
  }
  render()
}

const table = constructTable({
  features,
  columns,
  data: rows,
  getRowId: row => String(row.id),
  query,
  filterDebounce: 0,
  enableRowSelection: true,
  // The table never changes the query itself: it tells you, you decide.
  // Take the new query at once, fetch afterwards (C-19).
  onQueryChange: (next, reason) => {
    updates.push([next, reason])
    query = next
    render()
    load(next)
  },
  onRowSelectionChange: updater => {
    selection = typeof updater === 'function' ? updater(selection) : updater
    render()
  },
  state: { rowSelection: selection }
})

load(query)
```

`answer` is the in-memory server of [the protocol guide](protocol.md#example-typescript); in your code it is a `fetch`. The rules of the loop:

- **Nothing is emitted on mount or when you change the query yourself** (C-01, C-02). `setQuery` from a route restore or a "reset" button only redraws.
- **Take the new query in the same tick, fetch afterwards** (C-19). The plugin remembers its own last emit only until the end of the tick; after that every action builds on the `query` you hold. If you apply an emit late (after an `await`), the next action builds on the old query and loses the change before it. An update you ignore is fine: the table keeps drawing the old query, and the filter text the user typed stays.
- **One action, one update** (C-04). A sort is one update. A pending filter text that is applied first because of a sort or a page size change is one more, a `filter` update before the action's own. An action that would not change the query emits nothing.
- **Every update is a new object** that shares nothing with the one you gave (C-03), and it keeps the keys and rule properties the protocol does not know (C-60).
- **`getBaseQuery()`** returns the query the next action will build on: the last update emitted in this tick that you have not answered yet, else the one shown.

### The reasons

`onQueryChange` gets the reason as its second argument: `'page' | 'pageSize' | 'sort' | 'filter' | 'reset' | 'search'` (the first five existed in 2.2; `search` is new). Actions and what they produce:

| You call                                         | Reason     | The query changes                                         |
| ------------------------------------------------ | ---------- | --------------------------------------------------------- |
| `column.toggleQuerySorting()`                    | `sort`     | `sort` steps asc → desc → none; the page is kept          |
| `table.nextPage()`, `previousPage()`, `setPageIndex(n)` | `page` | `page` (page mode) or `cursor` (cursor mode)            |
| `table.setPageSize(n)`                           | `pageSize` | `pageSize`, and page 1 (the first cursor)                 |
| `column.setFilterInput(text)` and the rest of the filter input API | `filter` | that column's rules, page 1                   |
| `table.clearAllFilters()`                        | `reset`    | `filters: []`, page 1                                     |
| `table.setGlobalFilter(text)`                    | `search`   | `search`, page 1                                          |

Use `column.toggleQuerySorting()` for a header click, not `toggleSorting()`: it reads the next direction from the base query, so two clicks in one tick are two steps. Pass `table.setPageSize` whole numbers of at least 1; TanStack lifts smaller sizes to 1 before the plugin sees them (the Vue package validates first, C-06).

## Filter input

`filterInputFeature` gives each column a **draft**: the text typed, and optionally a condition picked from a menu. The draft is short-lived input, not part of the query; the query changes only when it is applied.

<!-- snippet: api-tour.ts#filter-api -->
```ts
export function filterInputTour() {
  const { table } = createServerTable({
    page: 1,
    pageSize: 10,
    sort: null,
    filters: []
  })
  const name = table.getColumn('name')!
  name.setFilterInput('ali*,!veli') // applied after `filterDebounce`
  name.applyFilterInput() // Enter: apply now
  name.setFilterCondition('Equal') // a menu pick; `null` clears the column
  name.clearFilterInput() // this column only
  table.flushPendingFilters() // every pending text, in ONE update
  table.clearAllFilters() // rules and drafts gone (reason `reset`)
}
```

| API                                  | What it does                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `column.getFilterInput()`            | The draft `{ text, condition }` to draw in the input; blank when nothing is typed            |
| `column.getFilterLabel()`            | `{ condition, count }` for the label under the input, `null` when there is nothing           |
| `table.getCanClearAllFilters()`      | Whether there is a rule or typed text to clear                                               |
| `table.store.state.filterDrafts`     | All drafts, in TanStack state (`filterDrafts`), so a framework adapter can subscribe to it   |

How it behaves, in the rule numbers of `contract/rules.md`:

- Typing applies after the debounce; emptying the input applies at once; Enter or `filterDebounce: 0` applies now (C-09, C-11, C-12).
- Several pending inputs are applied together in one `filter` update (C-13). A sort, page size change or search applies pending text **first**, and builds on the result; a page step is dropped if that flush changed the filters, because the page asked for belonged to the old filters (C-14).
- The text the user typed is never rewritten while typing. When the consumer's `query.filters` changes from outside, the input follows; an echo of the table's own emit leaves the text alone, even when the answer comes late (C-18).
- The grammar is the protocol's `parseFilterInput` ([the protocol guide](protocol.md#filters)); you can call it yourself, it is pure.

`filterInputFeature` works without `serverQueryFeature`: on plain TanStack state the applied rules are written to `columnFilters`, and whoever owns that state decides what "applied" means.

<!-- snippet: filter-input-alone.ts#alone -->
```ts
// `filterInputFeature` needs no `serverQueryFeature`: on plain TanStack state
// the typed text is parsed and written to `columnFilters`.
const table = constructTable({
  features: tableFeatures({
    coreReactivityFeature: storeReactivityBindings(),
    columnFilteringFeature,
    filterInputFeature
  }),
  columns: [
    { id: 'name', accessorKey: 'name' as const },
    { id: 'age', accessorKey: 'age' as const, filterType: 'number' as const }
  ],
  data: [{ name: 'Ali', age: 31 }],
  filterDebounce: 0
})

export function typeIntoName() {
  table.getColumn('name')!.setFilterInput('ali*,!veli')
  // table.store.state.columnFilters is now
  // [{ id: 'name', value: [<StartsWith ali>, <NotEqual veli>] }]
  return table.store.state.columnFilters
}
```

A column's entry in `columnFilters` holds the field's whole rule list (`FilterRule[]`), not a single value, with a filter function that does nothing: the rows are never filtered on the client. An entry that is not a rule list is ignored, and an empty list, `null` or `''` clears the field.

## Cursor paging

Give the table a query with a `cursor` key and the cursors the server answered with:

<!-- snippet: api-tour.ts#cursor -->
```ts
export function cursorTour() {
  const query: CursorQuery = {
    cursor: null,
    pageSize: 2,
    sort: null,
    filters: []
  }
  // The consumer's answer gave `cursors = { next: <token>, prev: null }`.
  const { table, updates } = createServerTable(query)
  table.getCanNextPage() // true: the next side has a cursor
  table.getCanPreviousPage() // false
  table.nextPage() // updates: [{ ...query, cursor: { token, direction: 'next' } }, 'page']
  return updates
}
```

TanStack's own `getCanNextPage`, `getCanPreviousPage`, `nextPage` and `previousPage` work unchanged; the projection arranges it so that they ask the right question (below). `nextPage` and `previousPage` do nothing when that side has no cursor, and neither does a jump to a page number: `setPageIndex` accepts only a step of one (`old => old + 1`) in cursor mode (C-56). A sort, filter, page size change, search or clear-all sends `cursor: null` (C-57). The total is not needed; if you count separately, pass it in as `rowCount` when it arrives.

If your backend only answers forward you can build `prev` yourself: see the stack in [the protocol guide](protocol.md#what-your-server-returns).

## Global search

`table.setGlobalFilter(text)` emits reason `search` with the text as given, spaces included, and goes back to page 1 (C-58). Empty text removes the `search` key: a query never holds `search: ''`, and setting the text the query already has emits nothing. The plugin does not debounce; if the text comes from a search box, debounce it before the call. A pending filter text is applied first. Register `globalFilteringFeature` for the call to exist; the plugin turns it into manual mode, so the rows are never filtered on the client.

## Row selection

Selection is TanStack's `rowSelectionFeature`, used as it is, except that its state is **yours**: pass `state.rowSelection`, and `onRowSelectionChange` tells you the new map (row key → `true`) instead of writing it. Nothing changes until you pass it back. Keys of rows that are not on the page stay in the map, and a selection change never emits a query (C-59). Keys are strings (use `getRowId`); convert a numeric id back before you send it to an API.

## Dispose

TanStack's `TableFeature` has no dispose hook, so the plugins give you one. Call `dispose(table)` when the table goes away. It clears the pending debounce timers and makes the table inert: nothing it does later, a late timer included, emits an update (C-62). Two tables on one page share nothing.

<!-- snippet: lifecycle.ts#dispose -->
```ts
// TanStack's `TableFeature` has no dispose hook, so the plugins give you one:
// call `dispose(table)` when the table goes away (a Vue component's
// `onScopeDispose`, a React effect cleanup). Pending debounce timers are
// cleared, and nothing the table does afterwards emits an update.
export function mountAndLeave() {
  const { table, updates } = createServerTable({
    page: 1,
    pageSize: 10,
    sort: null,
    filters: []
  })
  table.getColumn('name')!.setFilterInput('a')
  dispose(table)
  table.nextPage() // inert: emits nothing
  return updates
}
```

## The handlers are owned (C-61)

`serverQueryFeature` owns TanStack's `onSortingChange`, `onColumnFiltersChange`, `onPaginationChange` and `onGlobalFilterChange`, and pins `manualSorting`, `manualFiltering` and `manualPagination` to `true`, `sortDescFirst` to `false` and `enableMultiSort` to `false`. Passing your own value for any of them **throws when the table is built**, naming the option: the query would stop being the consumer's otherwise. Passing the same value it pins is fine. The way to react to a user action is `onQueryChange`.

<!-- snippet: owned-handlers.ts#owned -->
```ts
// `serverQueryFeature` owns `onSortingChange`, `onColumnFiltersChange`,
// `onPaginationChange` and `onGlobalFilterChange`, and pins the `manual*`
// flags, `sortDescFirst: false` and `enableMultiSort: false` (C-61).
// Replacing one throws when the table is built.
export function replaceTheHandler(): string {
  try {
    constructTable({
      features,
      columns: [{ id: 'name', accessorKey: 'name' as const }],
      data: [{ name: 'Ali' }],
      query,
      onQueryChange: () => {},
      onSortingChange: () => {} // not yours: use `query` and `onQueryChange`
    })
    return 'built'
  } catch (error) {
    return (error as Error).message
    // [query-table] serverQueryFeature owns onSortingChange: the query is
    // the consumer's (pass `query` and `onQueryChange` instead)
  }
}
```

## What TanStack does, and what stays our own

The rule behind the split: a behavior is first a TanStack option, then a thin plugin of ours, and only then framework code. TanStack holds the table state it models (sorting, pagination, column filters, column visibility, column order, column pinning, expansion), as a projection of your props, never a second copy ([ADR 0004](../decisions/0004-state-ownership.md)). Where TanStack's default differs from a Query Table rule, the plugin overrides it:

| Rule                      | TanStack default                                                       | What the plugin does                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C-05 paging               | 0-based `pageIndex`; next page allowed when the row count is unknown   | 1-based `page` ↔ 0-based index; `pageCount` from the total, or from a full page when it is unknown (C-23)                    |
| C-06 page size            | `setPageSize` keeps the top row                                        | sets `pageSize` and goes to page 1; ignores sizes that are not whole numbers                                                 |
| C-07 header sort          | `sortDescFirst` can start descending                                   | `sortDescFirst: false`, one sort; `toggleQuerySorting()` steps asc → desc → none from the base query                         |
| C-03, C-10, C-17 rule order | one value per column                                                 | the filter value is the field's `FilterRule[]` with a filter function that does nothing; rule order and unknown fields stay  |
| server data               | client-side row models                                                 | `manualSorting`, `manualPagination`, `manualFiltering` are `true` (C-61)                                                     |
| C-56 cursor paging        | `pageIndex` and `pageCount` count pages                                | the position is always "here": `pageIndex` is 1 or 0 by the previous cursor, `pageCount` one more by the next one; a step of ±1 becomes a cursor request |
| C-58 global search        | the global filter filters rows on the client                           | manual mode; the slice is projected from `query.search` and a change emits the query                                         |
| C-59 row selection        | the table keeps the selection                                          | the slice is controlled by the consumer                                                                                      |
| C-67 column visibility    | TanStack keeps `columnVisibility`                                      | the slice is `{ [field]: !hide }` of `columns`; `onColumnVisibilityChange` emits `update:columns`                            |
| C-69 column order         | TanStack keeps `columnOrder`; `column.pin('end')` appends to the region | the slices are projected from `columns` (order, `pinned`); `onColumnOrderChange` / `onColumnPinningChange` emit `update:columns`; inside a region the array order wins |
| C-71 right pinning        | `columnPinningFeature` computes offsets from `getSize()`               | the `end` region gives the order only; `--qt-pin-right` is measured like `--qt-pin-left` (ADR 0004, D3)                      |

What stays **own**, outside TanStack (ADR 0004, decisions D3 and D10):

- **Pin geometry.** Where a pinned column sticks (`--qt-pin-left`, `--qt-pin-right`) comes from measuring the rendered cells, not from TanStack's `columnSizingFeature`; widths stay CSS strings. This is part of the Vue package.
- **Column resizing.** `columnSizingFeature` and `columnResizingFeature` are not registered in v3. Resize is our own code and widths are controlled by the consumer, as in 2.2.
- **Filter drafts, the echo history, drag previews, measured geometry**: short-lived UI state the plugins and the Vue layer keep.

Row expansion is not own: TanStack's `rowExpandingFeature` holds it, as a projection of the consumer's props.

## Where to go next

- [The query protocol](protocol.md): what your server receives and returns.
- [Architecture](architecture.md): the layers, the `shared/` contract between the plugins, and the budgets.
- `contract/rules.md`: every rule above, numbered and tested at the plugin level (`packages/query-table-core/tests/`).
