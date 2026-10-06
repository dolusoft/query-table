# 0003 Two independent plugins and a shared action contract

Status: Accepted (2026-10-06)

## Context

The behavior that makes Query Table worth using is in two places:

- turning sort, page and filter changes into one `update:query` with a `reason`, never on mount, with echo protection (C-01 to C-08, C-19);
- the filter input: per-column draft text, the grammar, debounce, `flushPendingFilters`, the echo memory (C-09 to C-18).

A consumer may want one without the other. The first design let the two plugins communicate only through TanStack's column filter state. Both reviews found that insufficient: column filter state cannot say that drafts are pending, what a flush changed, or tell clearing one filter apart from a reset (C-14, C-22).

## Decision

Two TanStack plugins in `@dolusoft/query-table-core`:

- `serverQueryFeature`: TanStack sort/page/filter state ↔ `TableQuery`. One user action gives one update; a filter change goes to page 1; every update carries a `reason`; nothing on mount.
- `filterInputFeature`: draft text per column, parse with the grammar, condition, debounce, `flushPendingFilters`, echo history.

They never import each other. Their only shared code is `core/src/shared/`:

- a `beforeAction` hook registry: `filterInputFeature` registers its flush there; `serverQueryFeature` runs the hooks before every action and drops a page action when the flush changed the filters (C-14);
- an action dispatcher, `dispatch(action, reason)`, the single place that emits;
- an explicit `dispose` lifecycle: `TableFeature` has init and reset hooks but no dispose hook, and debounce timers must not outlive the table.

Lint allows a feature to import only `shared/` and the protocol.

## Consequences

- Either plugin works alone: a table with only `serverQueryFeature` is a supported, tested configuration.
- Every C-rule is tagged by its source, `tanstack` (TanStack behavior, configured) or `own` (our plugin code), and tested at the plugin level without a DOM.
- Two tables on one page, and unmounting one, are tested for isolation and for timers that leak.

## Trade-off

The shared contract is a small API of our own on top of TanStack's. It is the price of keeping the plugins separable; the alternative, one plugin, would make the filter input mandatory for every server-query consumer.
