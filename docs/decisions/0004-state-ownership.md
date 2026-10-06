# 0004 The consumer owns lasting state; TanStack holds projections

Status: Accepted (2026-10-06)

## Context

P2 says lasting state is controlled: the query, column widths and pinning come in as props and the table never writes to them. TanStack keeps its own state for sorting, pagination, column filters, sizing and pinning. If both own the same state they drift apart (P15 draft: no parallel state).

TanStack's defaults also differ from Query Table's contract in places: a page size change keeps the top row instead of returning to page 1; descending-first sorting is possible; next page is allowed with an unknown total; column sizing offsets sum numeric `getSize()` values, while Query Table accepts any CSS width and measures the rendered layout.

## Decision

**Ownership.** The consumer is the authority (`v-model:query`). TanStack's sort, pagination and filter slices are projections derived from `query` and the props; they are never written independently. `serverQueryFeature` keeps its own `lastEmitted` base (a port of `use-query-emitter.ts`: the last emitted query is the base until the consumer's update arrives or the microtask ends), so two updates in one tick stack (C-14). The Vue adapter's watchers run with `flush: 'pre'`, and a same-tick double-update test is mandatory. Emission never comes from subscribing to the whole store.

Legitimate transient state, owned by the plugins or the Vue layer: draft text, the drag preview of a resize, the echo history, measured geometry, focus, row expansion.

**Hybrid behavior.** A rule is first expressed through TanStack options. Where TanStack differs, a thin override is written and listed in the contract, rule by rule:

| Rule                        | TanStack default                                                     | Override                                                                                                       |
| --------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| C-05 paging                 | 0-based `pageIndex`; next page allowed when the row count is unknown | 1-based `page` ↔ 0-based index; `pageCount` from `totalRows`; next page checks the supplied total              |
| C-06 page size              | `setPageSize` keeps the top row                                      | not used; our action sets `pageSize` and `page: 1`                                                             |
| C-07 header sort            | `sortDescFirst` can start descending                                 | `sortDescFirst: false`; asc → desc → none                                                                      |
| C-03, C-10, C-17 rule order | one value per column                                                 | the filter value is `FilterRule[]` with a no-op `filterFn`; `replaceRules` keeps rule order and unknown fields |
| server data                 | client-side row models                                               | `manualSorting`, `manualPagination`, `manualFiltering: true`                                                   |

`getDefaultTableOptions` is pinned by a unit test.

**Pin geometry is own code.** `--qt-pin-left` comes from a single `ResizeObserver` measurement of the rendered pinned cells, in rendered order, utility cells included. `columnSizingFeature` is not used for offsets, and measurements are never written back into committed sizes. `columnPinningFeature` is used for order only, with an explicit mapping of the physical `left` side to TanStack's `start`. `Column.width` stays a CSS string; TanStack's numeric `size` is not adopted. A resize the consumer does not accept reverts to the committed width.

## Consequences

- A consumer that ignores or delays an update sees the table return to its own value; typed text is not lost (C-19).
- The override table above moves into `contract/rules.md` as a `Source:` line per rule (`tanstack` or `own`).

## Trade-off

We use less of TanStack than its feature list suggests (no sizing offsets, no internal state ownership). That is deliberate: the controlled contract is what consumers depend on, and TanStack's state is an implementation detail.
