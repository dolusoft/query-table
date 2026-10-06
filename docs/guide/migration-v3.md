# Migrating from 2.2.x to 3.0

> **Draft.** 3.0.0 is not released; this page is written against `3.0.0-next.0` and changes until 3.0.0 is approved. See [Known open items](#known-open-items).

3.0 splits the implementation into three packages and adds cursor paging, row selection and global search. If you use the `QueryTable` component, a bump of the package version is the whole change **unless your backend relies on the table dropping query keys it does not know**: that behavior changed ([changed behavior](#changed-behavior-unknown-query-keys-are-kept-c-60)). Everything else is additive: the props, events and DOM contract of 2.2.x stay, and the new ones are opt-in. 3.0.0 ships only when a gate that runs the same behavior tests against 2.2.x and 3.0 finds no difference other than the ones this page lists ([ADR 0006](../decisions/0006-release-3.md)).

## Install

| You use                                   | You install                                                          | Code change                                  |
| ----------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| the `QueryTable` component                | `@dolusoft/query-table` 3.0 (it brings the other two as dependencies) | none, unless your backend needs the [changed behavior](#changed-behavior-unknown-query-keys-are-kept-c-60) |
| TanStack Table and our plugins            | `@dolusoft/query-table-core` (it brings the protocol)                | new: see the [plugin guide](tanstack-plugins.md) |
| the query types or schema on a backend    | `@dolusoft/query-protocol` alone                                     | new: see the [protocol guide](protocol.md)   |

The package that was one in 2.2 is now three, versioned together ([ADR 0002](../decisions/0002-three-packages.md)). The Vue package keeps its name, so existing imports keep working:

```ts
import QueryTable, { type TableQuery } from '@dolusoft/query-table'
```

`TableQuery` stays as an alias of `PageQuery`, the page-mode query, so a 2.2 type annotation compiles unchanged. New code that accepts either mode uses `Query` from `@dolusoft/query-protocol`.

Until 3.0.0 is on npm, the packages are GitHub Release tarballs, and the Vue package depends on the other two by name. Map those names to their tarballs with `overrides` (`pnpm-workspace.yaml` for pnpm; the `overrides` or `resolutions` field of `package.json` for npm and Yarn), then add the component from its tarball. The exact lines are in the [README](../../README.md#install). When 3.0.0 reaches npm, delete the `overrides` entries and install by version: the names then resolve on their own.

The Node and `vue` requirements of 2.2 (Node 22.12 or newer, `vue` 3.5+) are unchanged for the packages.

## What is new

Everything below is opt-in. A 2.2 query has the same shape and means the same.

- **Cursor paging.** A query with a `cursor` key is in cursor mode: the server pages by opaque cursors, and the total may be unknown. See [Cursor mode](protocol.md) in the protocol guide and C-56 and C-57 in `contract/rules.md`.
- **Global search.** `search` holds the text; a change emits the new reason `search`. An empty text removes the key (C-58).
- **Row selection.** The selection is yours: a map of row key to `true`, passed in and drawn as given. It never emits a query (C-59).
- **The JSON Schema.** `@dolusoft/query-protocol/query.schema.json` describes a query for a backend, in any language.
- **TanStack plugins.** `serverQueryFeature` and `filterInputFeature` work on a plain TanStack table, without our component.

## The Vue package

All of this is opt-in; a table that uses none of it renders and emits as in 2.2.x. The behavior is in `contract/rules.md`, the full API in [`CONTRACT.md`](../../CONTRACT.md).

### Selection

Pass `v-model:selection`, a map of row key to `true`, and the table draws a column of checkboxes after the other utility columns, with a select-all checkbox in the header for the rows of the page. The table emits `update:selection` with the new map (only the `true` entries) and draws what you pass back: keys of rows on other pages stay in the map. Give `rowKey` so a key names the same row on every page; without it the row index is the key. Without the prop there is no column and no event (C-59, C-64).

```vue
<QueryTable v-model:query="query" v-model:selection="selection" row-key="id" ... />
```

### Cursor paging

Hold a `CursorQuery` (`{ cursor: null, pageSize, sort, filters }`) in `v-model:query` and pass the cursors of the page shown as `:cursors="{ next, prev }"`, `null` on a side with no page; pass `:total-rows="null"` when the total is unknown. `cursor: null` asks for the first page, `{ token, direction }` for the page on that side. The `pagination` slot gets `cursorMode: true` with `page: 1` and `pageCount: null`; `canPrevious` and `canNext` follow `cursors`, and `setPage` does nothing. A sort, a filter, a search, a new page size or clear-all goes back to `cursor: null` (C-56, C-57, C-65). The wire format is in the [protocol guide](protocol.md).

### Search and debounce

The `toolbar` slot gets `search` (the text to show), `setSearch(text)` and `applySearch()`, next to `canClearFilters` and `clearFilters`. Typed text is applied `searchDebounce` milliseconds after the last call (default `300`) as one update with reason `search`, from the first page; blank text and `:search-debounce="0"` apply at once. Pass `0` when your own code already debounces, so the text is not debounced twice. `applySearch()` applies a pending text now (Enter). The server decides what `query.search` matches (C-58, C-63).

### The `useQueryTable()` composable

`QueryTable` is built on `useQueryTable()`, which the package exports with its types (`QueryTableState`, `UseQueryTableOptions` and the others). It takes the props as refs or getters plus `onQueryChange(query, reason)` and, for selection, `onSelectionChange`. It returns `table` (the TanStack table), `columns`, `sort`, `filters`, `search`, `pagination`, `expansion`, `selection` and `baseQuery`. Use it to draw your own markup with the same behavior; frontendx keeps to `QueryTable` for now ([ADR 0005](../decisions/0005-composable-and-component.md)). A short example is in the [README](../../README.md#advanced-usage-usequerytable).

### The DOM of the selection column

With `selection` given the table renders three more hooks, and no other class or attribute: `qt-select-row` (the checkbox of a row, an `input` in a `td`), `qt-select-all` (the header checkbox, an `input` in a `th`) and `data-selected` (on the `tr` of a selected row). Without `selection` the DOM is that of 2.2.x (C-40, C-66). A skin written for 2.2 needs no change; to style the new column, select those hooks.

### Types

`TableQuery` is still exported from `@dolusoft/query-table`, now re-exported from the protocol as an alias of `PageQuery`, so a 2.2 annotation compiles unchanged. `Query`, `CursorQuery`, `PageCursors`, `RowSelection` and the other contract types come from the same entry.

## Changed behavior

The rules C-01 to C-55 keep their text; a comparison of `contract/rules.md` with its 2.2 version shows only added `Source:` lines and the new rules C-56 to C-66. The changes you can notice:

### Changed behavior: unknown query keys are kept (C-60)

In 2.2 the table copied a query field by field, so a key it did not know was **dropped** from every query it emitted. In 3.0 it is **kept**, in every emitted query, and it counts when two queries are compared. The same holds for properties of a rule besides `field`, `condition` and `value`.

```ts
// You hand the table:
const query = { page: 1, pageSize: 10, sort: null, filters: [], tenant: 'acme' }
// 2.2 emitted { page: 2, pageSize: 10, sort: null, filters: [] }
// 3.0 emits   { page: 2, pageSize: 10, sort: null, filters: [], tenant: 'acme' }
```

This is the one change in the existing behavior of the component, and it can alter what your backend receives. If you relied on the table stripping extra keys, strip them yourself before sending. If you worked around the stripping by re-adding a key in your `update:query` handler, you can delete the workaround.

### One more reason, `search`

`QueryChangeReason` gains `search`. A `switch` over the reasons that must be exhaustive needs a new branch; a handler that does not use `search` never sees it, because global search is only active when you use it.

### Plugin options are guarded

Applies to the TanStack plugins only, not to the component. `serverQueryFeature` throws when the table options replace the handlers or `manual*` options it owns (C-61), and a disposed table is inert (C-62). Both are new in 3.0, because there was no plugin in 2.2.

## Known open items

- The tarball `overrides` of [Install](#install) go away when 3.0.0 is published to npm; the version and the release location are then updated here and in the README.
- Render counts are reported by the gate, not compared; v3 re-baselines them, so a performance test that counts renders can need new numbers.
- The page is a draft until Zahid approves the principle text and 3.0.0 ([ADR 0006](../decisions/0006-release-3.md)).
