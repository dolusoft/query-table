# Principles

Approved by Zahid on 2026-10-06 for 3.0.0 ([ADR 0006](docs/decisions/0006-release-3.md)). Against 2.2.x, P8, P9, P10 and P11 are rewritten and P14 and P15 are new; P1–P7, P12 and P13 keep their substance, and P5 and P6 belong to the Vue package ([docs/decisions/](docs/decisions/README.md)). P5, P9, P10 and P15 were amended for 3.1.0 on 2026-10-06 ([ADR 0007](docs/decisions/0007-column-layout-row-pinning.md)).

P1, P4, P9, P10 and P14 were amended for the local evaluator on 2026-10-06 ([ADR 0008](docs/decisions/0008-local-query-evaluation.md)).

These are the boundaries of Query Table. A change that crosses one needs the principle changed first, in its own discussion. Each principle names the check that holds it; where the check is a review, it says so.

The behavior rules (`C-nn`) are in [contract/rules.md](contract/rules.md); the generated contract is [CONTRACT.md](CONTRACT.md).

## P1 The table renders; the consumer supplies the data

The table renders the rows it is given, in the order given, and reports through `update:query` what the user asked for. The component, `useQueryTable` and the core features never filter, search, sort or page those rows. Fetching, query execution, caching, persistence, authorization and source context belong to the consumer's data source.

A consumer that already holds every row of the resolved source context may evaluate the query with the opt-in local evaluator (`@dolusoft/query-protocol/local`, bound to Vue by `@dolusoft/query-table/local`). Its meaning is a named, immutable semantics profile written in `docs/guide/semantics.md` and held by the conformance suite the protocol ships; a server that claims the profile passes the same suite for the same dataset contract. The table has no local or remote mode and cannot tell one source from the other.

Why: data logic inside the table would become a second source of truth next to the data source. A separate evaluator with a written, tested meaning lets a table move between the browser and a server without changing what it shows.

Check: ESLint forbids `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage` and `indexedDB` in `src/`; C-61 pins the manual row-model settings; `layers/boundaries` and the built entry graph keep the evaluator out of the default entries; `packages/query-protocol/tests/conformance.spec.ts` runs the suite.

## P2 Lasting state is controlled; internal state is short-lived

Lasting state comes in as props: the query, and later column widths and pinning. The table keeps only UI state with a clear lifetime: typed filter text, focus, a drag preview, row expansion. It never writes to its inputs.

Why: two owners of one state drift apart. A consumer restoring a route or a saved view must be able to set everything that matters.

Check: C-01 and C-03; the C-03 test mounts the table with deeply frozen `query`, `columns` and `rows` and drives every action.

## P3 Every emitted update is defined

One user action gives one `update:query` of its own; nothing is emitted on mount; the order of updates and their `reason` are specified. The only case of two updates is a pending filter applied before the action that needs it.

Why: every update is a request to the consumer's server. An extra or reordered update is a wasted or wrong request.

Check: C-02, C-04, C-13 and C-14 and their tests.

## P4 The query is a typed, transport-free protocol

`TableQuery` is plain JSON: numbers, strings, booleans, arrays and objects. It says nothing about HTTP, URLs or a backend, and the table never evaluates it. Where a consumer evaluates it locally, its meaning is a semantics profile (`docs/guide/semantics.md`); the profile is not part of the JSON.

Why: the query is the API between the consumer and its backend, not only between the consumer and the table. It must survive a URL, a storage entry or a message unchanged.

Check: the C-03 test that sends every emitted query through a JSON round trip; `pnpm api:check` for the type.

## P5 No CSS, no styling props

The package ships no stylesheet and takes no styling props. The inline styles are listed: `width` on a header cell (its column's width, or the preview of a drag), `--qt-pin-left` on a cell pinned to the left and `--qt-pin-right` on a cell pinned to the right. A geometry value is only added as a listed `--qt-*` custom property that carries data, as the pin offset is; positioning, z-index and backgrounds stay in the consumer's CSS.

Why: every product has its own design system. A library that owns any of the look forces overrides.

Check: `pnpm check:package` fails when a `.css` file is in `dist/` or the tarball; C-31 asserts the only inline styles; `contract/dom.ts` lists the inline style the DOM test allows.

## P6 The DOM is public API

The classes in `contract/dom.ts` (all `qt-*`), its `data-*` attributes and `aria-sort` are the only hooks a skin may select. Each one is rendered by some state of the table.

Why: consumer CSS depends on them. Markup that is not listed is markup nobody promised.

Check: C-40 (`tests/contract/browser/dom-contract.browser.spec.ts`) and C-41 (`apps/playground/skin/skin.spec.ts`).

## P7 Native semantics first, then ARIA; no hardcoded text

The table uses real `table`, `th scope="col"` and `button` elements before ARIA. Every text it writes for people comes from the `labels` prop, with English defaults. A control always has a name: a sort button without a title is named by its field.

Why: products are localised, and accessibility that only works in English is not accessibility.

Check: C-44 (a test fails on a literal `aria-label="` in any `packages/vue/src/**/*.vue`, `packages/vue/src/core/labels.spec.ts`) and C-45; an axe-core scan of the table in light and dark themes (`tests/contract/browser/accessibility.browser.spec.ts`).

## P8 Performance is a budget, per consumer fixture

Every package has a size budget, measured the way a consumer pays for it: a built application that imports the package by name, minus the same application without it, minified and gzipped, transitive code (TanStack included) counted. The fixtures are: protocol only, each core entry (`/server-query`, `/filter-input`), the composable, and the component. A complete application is measured on its own; budgets are not summed. The render budget stays: component updates per fixed scenario. There is no listener per row or cell, and kept state is bounded: expansion keys are pruned to the supplied rows.

Size is not a goal in itself: a useful library may grow. A budget is the last measure plus 5%; a fixture can also have a ceiling. Both guard against silent drift. A deliberate growth raises the budget, and the ceiling when needed, in the same change, with a one-line reason in the budget's history; it needs no separate approval.

Why: tables with thousands of rows on a page are a real use, and TanStack moves the size of the package (ADR 0001). A regression that nobody measures ships; a budget measured on a different thing than the consumer pays is not a budget.

Check: `pnpm check:package-size` (`scripts/package-size-budget.json`, one entry per fixture of the protocol and core packages); `pnpm check:size` (`scripts/consumer-size-budget.json`, one entry per Vue fixture: the composable and the component); `pnpm check:renders` (`scripts/render-budget.json`, re-baselined for v3); C-26 for the pruning and C-28 for the single `tbody` listener.

## P9 One small, typed surface per package

Each package has one entry per published path and one API report, nothing else. A new capability goes into the core plugins first; the Vue package exposes what the core provides. New surface is a minor release and fixes are patch releases, within a major; the three packages are versioned together; a breaking change is decided explicitly before it is made.

A data-source helper that is not table behavior (the local evaluator) lives in the protocol, with a thin binding in the Vue package; it is not a plugin and the core does not know it.

Why: a version number only means something when the surface it versions is enumerable, and three packages released together must agree on one surface.

Check: `pnpm api:check` (api-extractor, one report per published TypeScript entry: `packages/<name>/etc/*.api.md`) and `pnpm contract:check`.

## P10 Extension order: slot, event, prop, method; inside, plugin first

For the public API of `QueryTable`: a slot when the consumer draws something, an event when the consumer reacts, a prop when the table needs data or configuration, and a method only for an action that cannot be expressed as state. A new prop or method rests on a rule in `contract/rules.md`. Inside the packages, a behavior is first a TanStack option, then a TanStack plugin of ours, and only then Vue code. The local evaluator is not table behavior; TanStack's client row models stay unused (ADR 0008).

Why: slots and events keep the table thin; props and methods grow it. A behavior that lives in a plugin is usable without our component.

Check: review, backed by the playground manifest: `apps/playground/manifest.spec.ts` fails when an API member has no page, and a page lists the rules it covers. A C-rule names its source (`tanstack` or `own`) in `contract/rules.md`: every rule except C-24 to C-52, C-54 and C-55 does; `tests/repo/contract-traceability.spec.ts` checks every source named but does not yet require one (`requireSource`).

## P11 Dependencies are few, pinned and layered

`@dolusoft/query-protocol` has no dependencies. `@dolusoft/query-table-core` depends on the protocol and `@tanstack/table-core` only; `@dolusoft/query-table` adds `@tanstack/vue-table` and has `vue` as its only peer. TanStack is pinned to an exact version (`@tanstack/store` comes with it); an upgrade runs the whole test suite and the equivalence gate. Nothing else is added. The playground and its skin are never part of a package.

Why: every dependency lands in the consumer's bundle and is a supply-chain risk. TanStack is accepted for one reason (ADR 0001) and only where it is used.

Check: `tests/repo/package-manifest.spec.ts` (each of the three packages: its allow-listed dependencies, TanStack at an exact version, only `dist` published, `vue` the only peer of the Vue package; the workspace root: private, no dependencies); `scripts/check-deps.mjs` allow-list in CI (`pnpm check:deps`); `pnpm knip`.

## P12 Rule, test, code and generated docs move together

A behavior change starts as a rule in `contract/rules.md`, gets a test that asserts the behavior, then the code, then the generated `CONTRACT.md` and the playground page. A rule ID in a test name is traceability, not coverage: the test must assert the behavior.

Why: a rule without a test rots, and a hand-edited document lies.

Check: `tests/repo/contract-traceability.spec.ts`, `pnpm contract:check` and `apps/playground/manifest.spec.ts`.

## P13 Page layout is out of scope

Panes, menus, popovers, tooltips and scroll containers belong to the consumer. The table hands out what they need (the `filter-menu` slot, its `trigger`), never draws them.

Why: layout is where products differ most, and a table that draws overlays fights the page it sits in.

Check: review; C-34 states that the table draws no popover and no tooltip.

## P14 Layers point one way

protocol → core → vue → playground. A package imports only from the layers before it; inside core, a feature (`serverQueryFeature`, `filterInputFeature`) imports only `shared/` and the protocol, never another feature. The protocol's local evaluator depends on the protocol types, never the other way; the Vue binding depends on the evaluator, never the table.

Why: a layer that imports upward cannot be used without the one above it, and two features that import each other are one feature.

Check: the ESLint layer rule `layers/boundaries` (`scripts/eslint-layers.mjs`, tested in `tests/repo/eslint-layers.spec.ts`) over imports, re-exports, dynamic imports, type imports and package sub-paths; `scripts/check-deps.mjs`; `scripts/check-entry-graph.mjs` over the built entries.

## P15 TanStack holds the table; we add only what it lacks

Table state that TanStack models (sorting, pagination, column filters, column visibility, column order, column and row pinning, expansion) lives in TanStack, as a projection of the consumer's props (P2), and is never kept a second time. What TanStack does is not rewritten; what it lacks is a plugin that implements the `TableFeature` interface, with its own state only for transient UI (drafts, drag preview, echo history, measured geometry). Plugins communicate through `shared/` (the `beforeAction` hooks, the dispatcher, `dispose`), never through each other.

Why: two copies of one state drift apart. A plugin keeps our behavior usable by any TanStack table, not only ours.

Check: the plugin-level unit tests, one per C-rule, tagged `tanstack` or `own` (`packages/query-table-core/tests/`); the same-tick double update and consumer rejection tests, C-14 and C-19, in the core (`packages/query-table-core/tests/server-query.spec.ts`) and in the Vue layer (`tests/contract/unit/filter.spec.ts`, `tests/contract/unit/query-model.spec.ts`); review against ADR 0003 and ADR 0004.
