---
name: query-table
description: Use when writing or reviewing code that uses Query Table v3 (`@dolusoft/query-table`, `@dolusoft/query-table-core`, `@dolusoft/query-protocol`) - the `QueryTable` Vue component, `useQueryTable()`, `v-model:query`, `serverQueryFeature`, `filterInputFeature`, the server-side Query JSON (page or cursor mode, filters, sort, search), the filter text grammar (`*foo*`, `!foo`, `a,b`), row selection, cursor paging, or a backend endpoint that has to answer a Query Table query.
---

# Query Table v3

A headless Vue 3 table for server-side data. It draws the rows you give it and tells you, through `v-model:query`, what the user asked for (page, page size, sort, filters, search). It never fetches, sorts, filters or pages rows, and ships no CSS.

Three packages, versioned together, layered one way (protocol -> core -> vue):

- `@dolusoft/query-protocol`: zero dependencies. Query types, the filter grammar (`parseFilterInput`), `query.schema.json`.
- `@dolusoft/query-table-core`: two TanStack Table v9 features, `serverQueryFeature` and `filterInputFeature`.
- `@dolusoft/query-table`: the `QueryTable` component and `useQueryTable()`.

The packages are on npm (`@dolusoft/query-table`; the protocol and the core come with it as dependencies). The current version is in the repository README; do not guess one.

## Which path

| You need | Use |
| --- | --- |
| A working table with the stock markup and your slots | `QueryTable` (Vue component) |
| The same behavior with your own markup, still in Vue | `useQueryTable()` |
| TanStack Table directly (any framework, or your own `useTable`) | `useTable` + `serverQueryFeature` + `filterInputFeature` from `@dolusoft/query-table-core` |
| Only the query types, the grammar or the schema (a backend, a URL codec) | `@dolusoft/query-protocol` |
| Evaluate a query over all rows already loaded in the browser | `defineDataset` + `useLocalQuery` from the opt-in `/local` entries; [local query reference](references/local-query.md) |

Start with `QueryTable`. Move to `useQueryTable()` when the markup must be yours; move to the TanStack path when there is no Vue component layer at all. Details: [references/vue-component.md](references/vue-component.md), [references/tanstack-path.md](references/tanstack-path.md).

## The rules that matter most

1. **The table is controlled.** The query is yours: pass it with `v-model:query` (or `:query` plus `@update:query`). The table keeps no copy of `page`, `pageSize`, `sort` or `filters`.
2. **One user action, one `update:query`.** The handler gets `(query, reason)`; `reason` is `'page' | 'pageSize' | 'sort' | 'filter' | 'reset' | 'search'`. The only case of two updates: typed-but-pending filter text is applied first, as its own `filter` update, then the action's update.
3. **Apply the emitted query in the same tick, fetch afterwards.** `v-model:query` does this. Do not `await` before assigning it: the next click would build on the old query and lose the change.
4. **Nothing is emitted on mount**, and changing `rows`, `totalRows`, `columns` or `query` from outside emits nothing.
5. **The table never evaluates the query.** Filtering, sorting and paging belong to the consumer's data source: a server or the opt-in local evaluator when all rows are loaded. Rules of one `field` combine with OR (AND when all are negative), rules of different fields with AND.
6. **Never mutate** `query`, `columns` or `rows`; the emitted query is a new object.
7. **Unknown keys survive.** Extra keys of the query and extra properties of a rule are copied into every emitted query (C-60).

## Minimal component

```vue
<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import QueryTable, { type TableQuery } from '@dolusoft/query-table'

const columns = [
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'integer' as const }
]
const query = ref<TableQuery>({ page: 1, pageSize: 10, sort: null, filters: [] })
const rows = ref<unknown[]>([])
const total = ref(0)

watchEffect(async () => {
  const answer = await fetchPeople(query.value) // your code
  rows.value = answer.rows
  total.value = answer.total
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

## Filter text grammar

What a user types in a text column becomes clean `FilterRule`s; the shortcuts never reach the query.

| Typed | Rule |
| --- | --- |
| `foo` | the picked condition, `Contains` by default |
| `*foo*` | `Contains` |
| `foo*` | `StartsWith` |
| `*foo` | `EndsWith` |
| `!foo` | `NotEqual` |
| `!*foo*`, `!foo*`, `!*foo` | `NotContains` (there is no `NotStartsWith` or `NotEndsWith`) |
| `a,b` | two rules for the same field (OR) |

`*`, `!`, `!*` and empty segments give no rule. There is no escape syntax and a comma always splits. Number and integer columns give number values (`2.5` in an integer column gives no rule), bool columns give booleans, date and datetime columns give strings, and the default condition of those types is `Equal`. The same function is exported: `parseFilterInput(text, { field, type? }, condition?)`.

## Server side

The query is plain JSON with `pageSize`, `sort`, `filters`, optional `search`, and exactly one of `page` (page mode) or `cursor` (cursor mode). Validate it against `query.schema.json` (`@dolusoft/query-protocol/query.schema.json`), then check every `field` against your own allow-list: `field` is not trusted input, never put it into SQL. Details, answer shapes and the .NET example: [references/protocol-server.md](references/protocol-server.md).

## Cursor paging, selection, search

- **Cursor mode**: a query with a `cursor` key. `cursor: null` is the first page; `{ token, direction }` asks for the page on that side of the one shown. Pass `:cursors="{ next, prev }"` (`null` where there is no page) and `:total-rows="null"`. A sort, filter, search, page size change or clear-all goes back to `cursor: null`.
- **Selection**: `v-model:selection` (a map of row key to `true`) adds a checkbox column. Give `row-key` so a key names the same row on every page. Keys are strings. Selection never emits a query.
- **Search**: the `toolbar` slot gets `search`, `setSearch(text)` and `applySearch()`; the text is applied `search-debounce` ms (default 300) after the last key. Pass `:search-debounce="0"` when you debounce yourself. The server decides what `query.search` matches.

## Common mistakes

| Mistake | Instead |
| --- | --- |
| Filtering or sorting only a server page in the browser | Send the query to the server, or evaluate the full source with the opt-in `/local` entries |
| `await fetch(...)` before assigning the emitted query | Assign first (`v-model:query`), then fetch with it |
| Mutating `query.value.page++` or `filters.push(...)` | Replace the object; or let the table emit it |
| `totalRows` used to decide whether rows show | Rows are drawn as given; `totalRows` only feeds the pager |
| Treating `reason` as part of the query JSON | It is not; send it yourself (header or key) if the server needs it |
| Expecting `!foo*` to arrive as a "not starts with" rule | It arrives as `NotContains` with value `foo` |
| Adding `onSortingChange` / `manualPagination` options to the TanStack table | `serverQueryFeature` owns them (C-61); the table throws at construction |
| Styling with props or expecting bundled CSS | No CSS ships; select the `qt-*` classes and `data-*` attributes of the DOM contract |
| Forgetting `dispose(table)` on the TanStack path | Call it in your scope cleanup; `useQueryTable()` does it for you |
| Using a `rowKey` that is not unique, or a dotted string path | A string `rowKey` is a direct property read; use a function for nested values |

## Where to look in the repository

- `README.md`: install, usage, every feature in short.
- `CONTRACT.md` (generated, do not edit): props, events, slots, types, the DOM contract, all behavior rules.
- `contract/rules.md`: the numbered behavior rules (`C-01` ...), each with its source (`tanstack` or `own`).
- `docs/guide/`: protocol, TanStack plugins, architecture, migration from 2.2.
- `PRINCIPLES.md`, `docs/decisions/`: the boundaries and the reasons.
