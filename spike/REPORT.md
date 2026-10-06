# Feasibility spike: a controlled query table on TanStack Table v9

PLAN-v3 task A3, with the two K6 scenarios. Measured on 2026-10-06 against `@tanstack/table-core` and `@tanstack/vue-table` **9.2.6** (exact pins, root `devDependencies` for the spike only; PR-B moves them into the packages). This directory lives on `next` and is deleted at the end of PR-C.

**Verdict: feasible.** All eight scenarios pass. None of them needs TanStack to give up ownership of a slice the consumer owns, so the stop condition of A3 is not met. Seven overrides are needed; each is small and listed below.

## What was built

- `core/query.ts`: the protocol sketch. The 2.2 query plus the K6 cursor mode, and pure projections of the query onto TanStack slices (`sorting`, `columnFilters`, `pagination`, the `pageCount` option).
- `core/shared.ts`: the shared contract of D1. A `beforeAction` registry, an emit counter that tells whether a flush really emitted, and `dispose`.
- `core/server-query-feature.ts`: `serverQueryFeature`. It sets `manual*`, `sortDescFirst: false` and single sort. It replaces `onSortingChange`, `onColumnFiltersChange` and `onPaginationChange` through `getDefaultTableOptions`, so a TanStack action emits a new query instead of writing state. Updaters are resolved against the projection of the base query, which ports `use-query-emitter.ts`.
- `core/filter-input-feature.ts`: `filterInputFeature`. It holds pending text per column and parses it with the 2.2 grammar (`parseFilterInput`). It applies every pending text in one `setColumnFilters` call and registers that flush with `shared/`. It does not import `serverQueryFeature`.
- `vue/spike-table.ts`: a controlled component on `useTable`. Every owned slice is passed through `state` getters that project a prop. Row selection and column sizing are emitted, never written.
- `spike.spec.ts`: the scenarios (24 tests, `unit` project, happy-dom).
- `size/`: consumer fixtures and `measure.mjs`.

Run: `pnpm exec vitest run --project unit spike/`, and `pnpm build && node spike/size/measure.mjs`.

## Scenarios

| # | Scenario | Result | Override needed |
| - | -------- | ------ | --------------- |
| 1 | Echo: nothing on mount or on an outside change; answered, ignored and late answers | pass | None beyond the base. The plugin resets its base when the `query` option is a new object, and at the end of the microtask. No Vue watch is needed in core. |
| 2 | Two pending drafts, then a sort; then a page step | pass | None. One `filter` update with both rules on page 1, then `sort` built on it. A page step after a flush that changed the filters is dropped (C-14); a flush that changes nothing does not drop it. |
| 3 | Page size returns to page 1; paging clamps to the total | pass | **C-06**: TanStack's `setPageSize` keeps the top row; the plugin turns a size change into `pageSize` + page 1. **C-06**: TanStack turns `setPageSize(0)` into 1 before any plugin sees it, so the Vue layer must validate `n`. |
| 4 | Resize the consumer rejects | pass | **C-49**: TanStack commits fractional widths (to 0.01), with no 40 px minimum and no Escape. The emit rounds; clamping, Escape, the per-frame preview and the keyboard (C-48–C-50) stay our own code. |
| 5 | Two updates in one tick (sort + page, page + page, with the consumer answering or ignoring) | pass | **C-07**: two header toggles in one tick lose the second one. `toggleSorting` reads the next direction from the drawn state before the updater runs. The sort action must derive the direction from the base query. |
| 6 | K6 cursor paging, unknown total: next/prev with `manualPagination`, last page, restart on filter/sort/size | pass | **Cursor projection**: `pageIndex` is 1 when a previous cursor exists and 0 otherwise. `pageCount` is one more than that when a next cursor exists. TanStack's own `getCanPreviousPage`, `getCanNextPage`, `previousPage` and `nextPage` then work unchanged. |
| 7 | K6 controlled row selection: ignored, applied, select-all, rows of another page | pass | None in TanStack. `state.rowSelection` is the `selection` prop and `onRowSelectionChange` emits `update:selection`. Keys of rows not on the page are kept. Needs `getRowId`. |
| 8 | Two tables share nothing; unmount disposes the plugin state | pass | **dispose**: `TableFeature` has no teardown hook, so the plugins register cleanup in `shared/` and the adapter calls `dispose` from `onScopeDispose`. |

Also confirmed: `getDefaultTableOptions` is merged under the user options (`{ ...defaults, ...options }`). The plugin's `on*Change` handlers therefore hold only while the Vue layer does not pass its own. That makes them a public seam: the consumer of the composable must not override them. PR-B pins the defaults with a unit test (D4), and the composable has to keep them out of its accepted options.

## Findings for PR-B and PR-C

1. **Echo without a framework watch.** `@tanstack/vue-table` copies reactive options into the table in a `watch` with the default `pre` flush, so `table.options.query` lags behind the prop until Vue flushes. Two signals cover this together: the plugin's own base, until the microtask ends, and the identity check on `options.query`. The microtask is queued before Vue's flush, so no user code runs between them. This is the same window 2.2 has.
2. **Header toggle direction** (scenario 5). The real UI does not hit it: two clicks are two tasks, and the base is answered in between. `flushPendingFilters()` followed by a programmatic sort, or the `toggleSort` of the header slot (C-51), can hit it. PR-B gives the sort action its own next-direction step (asc → desc → none from the base query) and calls `toggleSorting(desc)` or `clearSorting()`.
3. **Sizing stays own; drop the TanStack sizing features.** Resizing needs own code anyway (scenario 4, D3). `columnSizingFeature` + `columnResizingFeature` cost 2,032 B gzip, and the table would use them only as the start value of a drag. Recommendation: do not register them in v3, and keep the 2.2 handle.
4. **Typed plugin options.** The spike reads its options through casts (`as never` on `tableFeatures` and `useTable`). TanStack's documented way is declaration merging of `Plugins`, `TableOptions_FeatureMap` and `Table_FeatureMap`. The type-level fit of that registration is checked in PR-B.
5. **Cursor mode resets.** A sort in cursor mode drops the cursor (a cursor belongs to an order), unlike page mode where the page is kept (C-07). The new C-rules have to state this.
6. **Not covered.** Global search (K6, designed in PR-B), debounce and the echo history of the filter input (C-18; plugin-local, no TanStack state), pinning and pin offsets (own code by D3), render counts, real-browser runs.

## Consumer sizes

Method of `scripts/consumer-size.mjs`: each fixture is a minified app (Vue and TanStack bundled), and its cost is the difference to a baseline app. Two runs gave identical bytes. Raw data: `node_modules/.cache/measure/spike-size.json`.

| Fixture (baseline) | bytes | gzip | brotli |
| --- | ---: | ---: | ---: |
| protocol only: build, compare and parse queries (empty page) | 1,739 | 756 | 683 |
| core: headless `table-core` + six features + two plugins (empty) | 57,261 | 16,558 | 14,966 |
| TanStack only: `vue-table` + six features (Vue only) | 51,013 | 13,610 | 12,259 |
| of which the two sizing features | 8,527 | 2,032 | 1,759 |
| composable: `vue-table` + six features + two plugins (Vue only) | 56,115 | 15,397 | 13,800 |
| of which the two plugins | 5,102 | 1,787 | 1,541 |
| spike component, lower bound of the v3 component (Vue only) | 58,526 | 16,213 | 14,615 |
| 2.2 component next to the composable, upper bound (Vue only) | 88,260 | 26,279 | 23,010 |
| 2.2.12 component today, for reference (Vue only) | 32,541 | 10,815 | 9,926 |

The six features are sorting, pagination, column filtering, row selection, column sizing and column resizing. The D5 estimate (TanStack about 13.6 KB with seven features, the Vue path about 20–23 KB) holds. Without the sizing features (finding 3) the composable is about 13.4 KB. Adding the 2.2 markup code without its state logic puts the v3 component near the lower half of the 20–23 KB estimate.

## P8 budget proposal

The rule stays the one of today: each budget is the gzip cost measured in the PR that builds the package, plus 5%, raised only on purpose in the change that adds the weight. The spike sets the ceilings that this first measurement must stay under. A measurement above a ceiling is a design question for Zahid, not a budget raise.

| Fixture | Spike measure | Ceiling (gzip) |
| --- | ---: | ---: |
| `@dolusoft/query-protocol`, protocol only | 756 B | 1,500 B |
| `@dolusoft/query-table-core`, both entries, headless | 16,558 B | 17,500 B |
| `@dolusoft/query-table`, composable (`useQueryTable`) | 15,397 B | 16,500 B |
| `@dolusoft/query-table`, component (`QueryTable`) | 16,213–26,279 B | 23,000 B |

The ceilings explained:

- **Protocol: 1,500 B.** The cursor mode, `search` and the JSON shape roughly double the protocol. The protocol must still stay a fraction of the rest.
- **Core: 17,500 B.** The spike measure plus 5%, so it has room for global filtering but not for anything new.
- **Composable: 16,500 B.** The same rule, applied to the composable.
- **Component: 23,000 B.** The top of the D5 estimate, below the upper bound.

The render budget keeps its meaning and is re-baselined in PR-C (D7: render counts are not part of the equivalence gate).
