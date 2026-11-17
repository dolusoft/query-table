# 0021 A table for rows held in the page: `DataTable`, and one row open at a time (3.19)

Status: Accepted (2026-11-17), [query-table#202](https://github.com/dolusoft/query-table/issues/202) under [query-table#201](https://github.com/dolusoft/query-table/issues/201). Decided by Enes on 2026-11-17: the query is optional (K319-3) as #201 D-01 ([comment](https://github.com/dolusoft/query-table/issues/201#issuecomment-6943069469)), and the dataset comes from the columns (K319-4) as #202 D-01 ([comment](https://github.com/dolusoft/query-table/issues/202#issuecomment-6943069985)). Amends the Fence clause of [ADR 0005](0005-composable-and-component.md) (K319-6).

## Context

`QueryTable` renders the rows it is given and reports what the user asked for (P1). Many of our lists are not query-backed at all: every row is already in the page, a few hundred at most, and the list only needs sorting, a search, paging and rows that open. Today such a list either wires `v-model:query`, `useLocalQuery` and a `Dataset` by hand (`apps/playground/examples/LocalQuery.vue` names every field twice, once as a column and once in the dataset), or it is written as a second table with its own markup. The second way gives two table families: two looks, two behaviors, every feature built twice. The goal of #201 is the opposite: the product's other tables move onto this repository over time, and that only works if a table for rows held in the page *is* `QueryTable`, not a sibling of it.

The pieces exist. The local evaluator has a written, tested meaning (ADR 0008, ADR 0020), its Vue binding is `useLocalQuery`, and `QueryTable` already draws selection, expansion (`hasSubtable`, C-26), cell slots and paging. What is missing is the composition, a way to use it without a query, and one behavior the product's lists ask for that `hasSubtable` does not have: an accordion, where opening a row closes the one that was open.

## Decision

- **One composition, no second engine (K319-1).** `DataTable` is `useLocalQuery` plus `QueryTable`, published behind its own entry, `@dolusoft/query-table/data-table` (`packages/vue/src/data-table/`). It renders `QueryTable` with the evaluated page and passes every prop, slot, event and exposed method through. It has no markup, no TanStack state and no table behavior of its own; it holds only what K319-3 and K319-4 give it. So everything `QueryTable` gains (pinning, a virtual body, grouping, row navigation, the flash) `DataTable` has in the same release, and its DOM is the DOM of `QueryTable` for the same page (C-127). `QueryTable`, `useQueryTable` and the core plugins still never filter, search, sort or page: the evaluator does, outside the table, as it does for any consumer today (P1).
- **The surface (K319-2, C-124).** `DataTable<T>` takes the props of `QueryTable<T, TableQuery>` with these changes:
  - `rows` is every row of the source, not one page.
  - `rowKey` is required and is a top-level field name (C-26 reads it directly, not as a dotted path): the evaluator breaks sort ties by the dataset's `key`, and selection and expansion need a row identity across pages anyway (C-26). The key field must be a column (it may be `hide: true`) of type `string` or `integer`, as `defineDataset` requires.
  - `totalRows`, `cursors` and `infinite` are left out: the total is the evaluator's `totalRows`, the evaluator pages by `page` and `pageSize` only (`cursor-not-supported`), and there is no next page to ask a server for.
  - `rowsUpdate` is left out: `DataTable` knows the hint. A new query gives `snapshot`, a new `rows` gives `live`, so the flash (ADR 0011) marks what changed in the source and not what a sort moved.
  - New: `profile` (the semantics profile, default `'tr-2'`; the default is fixed and never moves to a later profile, since a profile name is a meaning, ADR 0008), `search` (the fields of the global search, `string` fields only), `paginate` (default `true`; `false` draws every matching row and does not forward the `pagination` slot, so no pagination block is drawn) and `dataset` (K319-4).
  - Slots: those of `QueryTable`, plus `error` with `{ error }`, drawn in the empty row while the evaluator reports an error, because an invalid query must not look like an empty result (`LocalQuery.error`). The DOM stays `qt-empty-row`; no hook is added.
  - Events and exposed methods: those of `QueryTable`, unchanged. `update:query` is emitted as it is today, with or without `v-model:query` (K319-3).
- **The query is optional (K319-3, C-125).** With `v-model:query` the query is the consumer's, exactly as with `QueryTable`: an update the consumer does not apply changes nothing (C-19). Without it `DataTable` holds the query itself. It starts at `{ page: 1, pageSize, sort: null, filters: [] }`, where `pageSize` is the first of `pagination.pageSizeOptions` or `10`, and it applies its own `update:query`. It lives as long as the component and is not written anywhere. A `query` given later wins from then on and the held copy is dropped. P2 lists this query with the short-lived state; P2 is amended in its own pull request first, as `PRINCIPLES.md` requires. A consumer that restores a route or a saved view gives `v-model:query` and has the control it has today.
- **The dataset comes from the columns (K319-4, C-126).** Without a `dataset` prop, `DataTable` builds one with `defineDataset` from what it already has: `key` is `rowKey`; every column (hidden ones included) is a field with its `type` (default `'string'`), `sortable` and `filterable` (each `false` when the column or the table says so) and the default reader of the field's dotted path, the one cells use (C-30); `search` marks the fields of the global search. A column whose `field` is not a field of the rows still becomes a field, and reads `undefined`, as its cell does. A `dataset` prop replaces the derived one whole, for a field that needs `get` or `offset`, or a queryable field with no column. The derived dataset is rebuilt when `columns`, `rowKey` or `search` change, compared by value, so reordering or resizing a column does not rebuild it.
- **One row open at a time (K319-5, C-123).** `QueryTable` and `useQueryTable` take `expandMode: 'multiple' | 'single'`, default `'multiple'` (the behavior of 3.18). With `'single'`:
  1. Pressing a closed row's button opens it and closes the open row, in one state change of TanStack's `expanded` slice (P15). Pressing the open row closes it.
  2. `rowExpansionChange` (C-122) is emitted for the row that closed, then for the row that opened, so a consumer that tracks open rows (#97) never sees two open.
  3. The `isExpanded` seed opens the first row of `rows`, in their order, that asks for it; the others stay closed.
  4. `expandAll()` does nothing; `collapseAll()` is unchanged.
  5. A row that leaves `rows` closes as before (C-26); no other row opens in its place.
  6. Keyboard, `aria-expanded` and the `subtable` slot are those of C-26.
  The state is still keyed and pruned as C-26 says, so it is bounded by one key. The behavior lives in the expansion of `useQueryTable` next to `toggle`, the seed and `expandAll`; TanStack has no option for it, and it is not logic over consecutive inputs, so it is neither a plugin nor a pure core module (P10).
- **The fence (K319-6).** frontendx may import `DataTable` from `@dolusoft/query-table/data-table`. The rule against `useQueryTable` and `@tanstack/*` stays. This replaces the first sentence of the Fence clause of [ADR 0005](0005-composable-and-component.md) ("frontendx uses only `QueryTable`"); ADR 0005 carries a note that points here, and its text is not edited.
- **Layers and size (K319-7).** `src/data-table/` is a part of the Vue package that may import the main part, the `local` part and `@dolusoft/query-protocol/local`. The main part and `local` never import it, so the binding still never depends on the table (P14) and the default entry still never reaches the evaluator (C-75). `layers/boundaries` and `scripts/check-entry-graph.mjs` learn the part; `pnpm check:size` gets a `data-table` fixture; `pnpm api:check` gets a report for the entry.

## Scope

In: #202. `DataTable`, `expandMode`, the principle amendments below, the rules, the tests, the API report, the size fixture and a playground page.

Out, each its own change:

- How the product's table looks: [query-table#203](https://github.com/dolusoft/query-table/issues/203). `DataTable` draws the DOM of `QueryTable`, so one skin covers both.
- The variation matrix and the migration guide: [query-table#204](https://github.com/dolusoft/query-table/issues/204).
- A starting sort or filter without `v-model:query` (an `initialQuery`). A consumer that needs one gives `v-model:query`; the prop is added if #204 shows it is common.
- Rows that arrive in pages from a server. That is `QueryTable` with `infinite`; `DataTable` holds every row.

## Principles

Amended in their own pull request, before the implementation:

- **P1.** Adds: `DataTable` is the evaluator's binding and `QueryTable` side by side, a data source and a table, not a mode of the table; `QueryTable`, `useQueryTable` and the core still never evaluate.
- **P2.** Adds the query of a `DataTable` without `query` to the short-lived state, with its lifetime: the component's.
- **P9.** Adds: the composition of the binding and the component lives behind its own entry, like the binding.
- **P14.** Adds `data-table` to the parts of the Vue package and what it may import.

## Consequences

- A new entry with its own API report and size fixture. The default entry and `/local` do not grow: nothing they import changes.
- `QueryTable` and `useQueryTable` gain one prop, `expandMode`, and C-122 gains the order of the two events of a single-mode press. The DOM contract does not change.
- `DataTable` follows every future change of `QueryTable` without work of its own. The same holds the other way: a prop added to `QueryTable` that only makes sense with a server (as `infinite` does) must be listed as left out in C-124, and the test that compares the two surfaces fails until it is.
- Every query change evaluates every row in the page. That suits the lists this is for (hundreds of rows, a few thousand at most); the playground page of #204 measures a large one, and a source that is too large for the page stays on a server with `QueryTable`.

## Alternatives

- **The query stays required (#201 S1, answer b; not chosen).** No P2 change, but every `DataTable` would need a `ref` and `v-model:query`: the composition would save the consumer the dataset and the wiring but not the state.
- **The consumer gives the dataset (#202 S1, answer b; not chosen).** No derivation and no `search` prop, but every table would write each field twice, and the two lists drift (a column made sortable in one place and not the other). The `dataset` prop of K319-4 keeps this path for the cases that need it.
- **A component with its own markup**, written for lists only. Smaller for one list, but it is the second table family #201 is meant to end.
- **TanStack's client row models.** They would sort and filter by TanStack's meaning, not the written profile, and ADR 0008 keeps them unused.

## Trade-off

A second public component is one more surface to keep stable. It is kept small by having no behavior of its own: its surface is that of `QueryTable` with a listed difference, and a test holds the difference. In return, a list held in the page is drawn by the same table, with the same skin and every feature, and a list that later needs a server changes its data source, not its table.

## Rules

- **C-123 One row open at a time.** K319-5. Amends C-122 (the order of two events for one press).
- **C-124 `DataTable`: the rows it draws.** K319-1, K319-2.
- **C-125 `DataTable`: the query it holds.** K319-3.
- **C-126 `DataTable`: the dataset from the columns.** K319-4.
- **C-127 `DataTable`: the DOM of `QueryTable`.** K319-1. For the same columns and the same page of rows, the two render the same markup.
