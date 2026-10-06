# 0001 Build v3 on TanStack Table v9

Status: Accepted (2026-10-06)

## Context

Query Table 2.2.x is a single Vue package with no runtime dependencies. It keeps its own small implementations of sorting, paging, pinning, resizing and expansion, all in service of one premise: the server does the data work and the table reports what the user asked for (`update:query`).

TanStack Table v9 (MIT, 9.0.0 released 2026-08-04, actively maintained) is a headless table core with a feature-plugin architecture: `tableFeatures({...})`, the `TableFeature` interface (`getInitialState`, `getDefaultTableOptions`, `getDefaultColumnDef`, `constructTableAPIs`, prototype assigners, instance-data initialisers), type maps through `declare module`, and `manual*` options for server-side data. Consumers who already use TanStack (the shadcn `Table` recipe, for one) cannot reuse Query Table's server-query behavior today.

## Decision

v3 is built on TanStack Table v9.

- `@tanstack/table-core` and `@tanstack/vue-table` are pinned to an exact version (`9.2.6`, no `^` or `~`). An upgrade is a deliberate change that runs the whole test suite, the equivalence gate (ADR 0006) and the budgets.
- `@tanstack/store` comes in as their transitive dependency. It is accepted as part of TanStack, not as a separate choice; no other runtime dependency is added.
- Behavior first comes from TanStack configuration; only where TanStack cannot express a rule does Query Table add a thin plugin on top (ADR 0004).

## Consequences

- Query Table's server-query and filter-input behavior becomes reusable as TanStack plugins, outside the `QueryTable` component.
- P11 ("no runtime dependencies") no longer holds as written. Its new form: `@dolusoft/query-protocol` has zero dependencies; TanStack lives only in the core and Vue packages; the version is pinned; nothing else is added.
- A dependency check in CI enforces the allow-list per package (`scripts/check-deps.mjs`, PR-B).

## Trade-off: size

The gain is not less code. It is a TanStack-native path for consumers and an extension model for features. The cost is size:

- The size baseline of v3 is 2.2.12: it adds 10,815 B (minified + gzip) to a consumer application (`scripts/consumer-size.mjs`, measured in the spike, [`spike/REPORT.md`](https://github.com/dolusoft/query-table/blob/fb3485b185316b27047fc1574083e42773e5afd9/spike/REPORT.md#consumer-sizes)). The 2.2 budget is set at that figure (`scripts/consumer-size-budget.json`); every comparison in v3 documents uses 10,815 B.
- TanStack alone was estimated at about +9.8 KB gzip with three features and +13.6 KB with seven. The full Vue path is expected around 20–23 KB gzip.
- The spike measured it with the same method ([`spike/REPORT.md`](https://github.com/dolusoft/query-table/blob/fb3485b185316b27047fc1574083e42773e5afd9/spike/REPORT.md#consumer-sizes)): `@tanstack/vue-table` 9.2.6 with the six features the table uses adds 13,610 B; the two plugins add 1,787 B on top (composable 15,397 B); a headless core consumer adds 16,558 B; a protocol-only consumer 756 B. The v3 component lands between 16,213 B (the spike component, a lower bound) and 26,279 B (the 2.2 component next to the composable, an upper bound).

P8 is rewritten around consumer fixtures (protocol only, each core entry, the composable, the component), each with its own budget. The first numbers came from the feasibility spike ([`spike/REPORT.md`](https://github.com/dolusoft/query-table/blob/fb3485b185316b27047fc1574083e42773e5afd9/spike/REPORT.md#p8-budget-proposal), removed from the tree with the spike in PR-B), not from estimates. The measured v3 numbers are in the budget files: `scripts/package-size-budget.json` and `scripts/consumer-size-budget.json`. Size is not a blocker (K7, 2026-10-06): a budget is the last measure plus 5%, and a ceiling guards against silent drift; a deliberate growth raises both in the same change, with its reason in the budget history. The core ceiling is 18,500 B gzip. The render budget keeps its meaning but is re-baselined for v3; render counts are not part of the equivalence gate.
