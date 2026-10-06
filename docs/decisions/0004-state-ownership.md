# 0004 The consumer owns lasting state; TanStack holds projections

Status: Accepted (2026-10-06)

## Context

P2 says lasting state is controlled: the query, column widths and pinning come in as props and the table never writes to them. TanStack keeps its own state for sorting, pagination, column filters, sizing and pinning. If both own the same state they drift apart (P15 draft: no parallel state).

TanStack's defaults also differ from Query Table's contract in places: a page size change keeps the top row instead of returning to page 1; descending-first sorting is possible; next page is allowed with an unknown total; column sizing offsets sum numeric `getSize()` values, while Query Table accepts any CSS width and measures the rendered layout.

## Decision

**Ownership.** The consumer is the authority (`v-model:query`). TanStack's sort, pagination and filter slices are projections derived from `query` and the props; they are never written independently. `serverQueryFeature` keeps its own `lastEmitted` base (a port of `use-query-emitter.ts`: the last emitted query is the base until the consumer's update arrives or the microtask ends), so two updates in one tick stack (C-14). The Vue adapter's watchers run with `flush: 'pre'`, and a same-tick double-update test is mandatory. Emission never comes from subscribing to the whole store.

Legitimate transient state, owned by the plugins or the Vue layer: draft text, the drag preview of a resize, the echo history, measured geometry, focus.

Row expansion is not transient: `rowExpandingFeature` of TanStack holds it, as a projection of the consumer's props (P2) and never kept a second time (K3, P15).

**Hybrid behavior.** A rule is first expressed through TanStack options. Where TanStack differs, a thin override is written and listed in the contract, rule by rule:

| Rule                        | TanStack default                                                     | Override                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-05 paging                 | 0-based `pageIndex`; next page allowed when the row count is unknown | 1-based `page` ↔ 0-based index; `pageCount` from `totalRows`; next page checks the supplied total                                                  |
| C-06 page size              | `setPageSize` keeps the top row                                      | not used; our action sets `pageSize` and `page: 1`                                                                                                 |
| C-07 header sort            | `sortDescFirst` can start descending                                 | `sortDescFirst: false`; asc → desc → none                                                                                                          |
| C-03, C-10, C-17 rule order | one value per column                                                 | the filter value is `FilterRule[]` with a no-op `filterFn`; `replaceRules` keeps rule order and unknown fields                                     |
| server data                 | client-side row models                                               | `manualSorting`, `manualPagination`, `manualFiltering: true`                                                                                       |
| C-06 values below 1         | `setPageSize` turns them into 1                                      | the Vue layer validates `setPageSize(n)` before calling TanStack; the plugin ignores sizes that are not whole                                      |
| C-07 two toggles in a tick  | `toggleSorting` reads the next direction from the drawn state        | the sort action derives the next direction from the base query (the spike shows the second toggle is lost)                                         |
| cursor paging (K6)          | `pageIndex` and `pageCount` count pages                              | the position is always "here": `pageIndex` 1 or 0 by the previous cursor, `pageCount` one more by the next one; a ±1 step becomes a cursor request |

`getDefaultTableOptions` is pinned by a unit test.

**K6 additions (2026-10-06).** The three features v3 adds follow the same ownership rule:

- **Row selection.** `rowSelectionFeature` is used as is, but its slice is controlled: the consumer owns `v-model:selection` (row key → `true`), `state.rowSelection` is that prop, and `onRowSelectionChange` emits `update:selection` instead of writing. Keys of rows that are not on the current page stay in the selection. Rows are keyed by `getRowId` (the table's `rowKey`).
- **Cursor paging.** The protocol gets a cursor mode next to page numbers: the query carries the cursor to follow and its direction, the consumer passes the cursors its server answered with, and the total may be unknown. `serverQueryFeature` carries both modes; TanStack's own `getCanPreviousPage`, `getCanNextPage`, `previousPage` and `nextPage` work unchanged through the projection in the table above. A filter, a sort or a page size change starts over at the first cursor (proposed in the spike, finalised in PR-B).
- **Global search.** `Query.search` in the protocol; `globalFilteringFeature` in manual mode, its slice projected from `query.search` like the column filters. Not part of the spike; designed in PR-B.

The feasibility of the ownership model, including cursor paging and controlled selection, is measured in [`spike/REPORT.md`](https://github.com/dolusoft/query-table/blob/fb3485b185316b27047fc1574083e42773e5afd9/spike/REPORT.md) (the spike left the tree in PR-B; the link is to its last version).

**Pin geometry is own code.** `--qt-pin-left` comes from a single `ResizeObserver` measurement of the rendered pinned cells, in rendered order, utility cells included. `columnSizingFeature` is not used for offsets, and measurements are never written back into committed sizes. `columnPinningFeature` is used for order only, with an explicit mapping of the physical `left` side to TanStack's `start`. `Column.width` stays a CSS string; TanStack's numeric `size` is not adopted. A resize the consumer does not accept reverts to the committed width.

**Column sizing and resizing stay own (D10, 2026-10-06).** TanStack's `columnSizingFeature` and `columnResizingFeature` are NOT registered in v3. Resize is our own code (rounding, the 40 px minimum, Escape, the keyboard, the per-frame preview), TanStack would only have supplied the start value of a drag, and the two features cost 2,032 B gzip ([`spike/REPORT.md`](https://github.com/dolusoft/query-table/blob/fb3485b185316b27047fc1574083e42773e5afd9/spike/REPORT.md#consumer-sizes)). Widths stay consumer-controlled as in 2.2. This supersedes K3's "resize in TanStack".

## Consequences

- A consumer that ignores or delays an update sees the table return to its own value; typed text is not lost (C-19).
- The override table above moves into `contract/rules.md` as a `Source:` line per rule (`tanstack` or `own`).

## Trade-off

We use less of TanStack than its feature list suggests (no sizing offsets, no internal state ownership). That is deliberate: the controlled contract is what consumers depend on, and TanStack's state is an implementation detail.
