# 0002 Three packages: protocol, core, vue

Status: Accepted (2026-10-06)

## Context

The query (`TableQuery`, filter rules, `reason`) is the API between a consumer and its backend, not only between the consumer and the table (P4). A backend (.NET) wants to validate it without any UI code. The TanStack plugins need the protocol but not Vue. The Vue component needs both.

## Decision

v3 is a pnpm workspace with three published packages, layered in one direction:

1. `@dolusoft/query-protocol`: zero dependencies. Query types, filter rules, reasons, the JSON shape, the filter grammar and `parseFilterInput`. A JSON Schema of the query is generated from it, for backends.
2. `@dolusoft/query-table-core`: depends only on `@dolusoft/query-protocol` and `@tanstack/table-core`. The TanStack plugins, with entry points `/server-query` and `/filter-input`.
3. `@dolusoft/query-table`: the Vue package, `useQueryTable()` and the `QueryTable` component. Its public API and DOM contract stay those of 2.2.x.

Layer direction: protocol → core → vue → playground. An import against that direction fails lint (P14 draft), including re-exports, dynamic imports and package sub-paths.

A new package is opened only when it has a different dependency set or a different consumer.

## Consequences

- Each package has its own manifest test, API report (api-extractor) and size budget.
- An installed-tarball test outside the workspace proves that the three packages work together as published (PR-C).
- Consumers of 2.2.x keep importing `@dolusoft/query-table`; its name and surface do not change.

## Trade-off

Three packages mean three manifests, three API reports and lockstep versioning (ADR 0006). The split is worth it because the protocol has a consumer that never runs JavaScript UI, and the plugins have consumers that never use our component.
