# 0008 Local query evaluation as a data source

Status: Accepted (2026-10-06)

## Context

Some tables hold every row in the browser: a report drill-down, a disk list, a list of completed jobs. In frontendx they run today on the old `vue3-datatable` with `is-server-mode="false"`, or on a `computed` that sorts by hand. Query Table only knows the server side (P1), so these tables cannot move to it; if they did, each would write its own sorting code and each would give a different order.

The goal is that a table moved to Query Table can later move from local data to a server **by changing only its data source**: the template, the columns and the query stay. The promise is conditional: equivalent results require the same dataset semantics, source scope, snapshot, default order, and supported query capabilities. That needs one meaning of a `Query`, written down, that a local evaluation and a backend both follow. Today there is none: the backend paths (ClickHouse, Mongo, an in-memory list) differ from each other in case folding, null order and wildcard handling, and none of them folds the Turkish `İ`/`ı`.

Three designs were weighed:

- **2a: a separate evaluator in the protocol.** The table is not touched. An opt-in function evaluates a `Query` over the rows the consumer holds, in a separate entry of `@dolusoft/query-protocol`, with a thin Vue binding that reads the consumer's query and hands `rows` and `totalRows` to `QueryTable`.
- **2b: TanStack's client row models.** Our rule matcher and a Turkish comparison as TanStack `filterFn` and `sortingFn`, and TanStack's own filtered, sorted and paginated row models do the work. Rejected: the meaning would be set by the TanStack version and its row model pipeline, not by a written definition, so equivalence with a server cannot be shown; `rows` would mean "all rows" in one mode and "this page" in the other, and the contract of the table would double.
- **2b later: a TanStack feature that wraps the 2a evaluator.** Possible once 2a exists, since the evaluator is plain functions over plain data. Not done now; nothing in this record blocks it.

## Decision

**A modified 2a.** Local evaluation is a data source, not table behavior.

- `@dolusoft/query-protocol/local` exports `applyQuery(allRows, query, dataset, { profile, paginate })`, `slicePage`, `defineDataset` and the error and result types. It has no dependencies and imports only the protocol types, constants and query helpers. `@dolusoft/query-table/local` exports `useLocalQuery`, which reads the consumer's query ref and never writes it. The default entries of the three packages neither export nor import either one, and no path in their built module graph reaches them.
- The table has no local or remote mode. The component, `useQueryTable` and the core features never filter, search, sort or page the rows they are given (P1).
- What can be asked of the rows is a `dataset`, separate from the columns: the field types, which fields are searched, which can be sorted or filtered, and the key that identifies a row and breaks sort ties. Only a dataset made by `defineDataset` (checked, copied, frozen and branded) is accepted.
- **A named, immutable semantics profile.** Every evaluation names its profile; there is no default. The first is `tr-1`, written in [`docs/guide/semantics.md`](../guide/semantics.md): no Unicode normalization, a closed table that composes the decomposed Turkish letters, our own folding and a Turkish letter order (no `Intl`, no `toLowerCase`, no `localeCompare`), everything defined on UTF-16 code units so that .NET can write it with a `char` loop. A profile never changes meaning: where code departs from the document, the code is fixed; a new meaning is a new profile name in a minor release.
- **Unsupported or malformed input is an error, never a partial result.** Query, data and getter problems come back as a value, the first one in the order of the profile, with a code and a JSON Pointer; a malformed dataset definition or a broken precondition throws `TypeError`.
- **The conformance suite ships with the protocol package.** JSON case files, a manifest that carries `fixtureFormat`, `revision`, the counts and the sha256 of every file's bytes, and a TypeScript runner in CI. The suite is also attached to each GitHub release as `conformance-<revision>.tgz`, with the manifest's sha256 in the release notes, so a .NET runner can pin it. `fixtureFormat` versions the file format, `revision` the content; a case is never changed or removed, only withdrawn and replaced. A server that claims `tr-1` passes the same suite for the same dataset contract.
- **Reserved names.** The evaluator refuses the top-level keys `sorts`, `any`, `group` and `aggregates`, and the conditions `IsNull` and `IsNotNull`, with `unsupported-extension`; `columns` and `range` are reserved in the documentation only. The list is frozen for 3.x and is not a way to grow the query: future execution forms (multi-column sort, OR across fields, grouping) go into a versioned execution envelope that older evaluators refuse, decided in its own record.
- In development, `useLocalQuery` logs each new error once with `console.error`; in production it is silent and returns the error. The check is `process.env.NODE_ENV !== 'production'`, which the consumer's bundler replaces. `import.meta.env.DEV` is not used: in this repository's library build it is replaced with `false` at build time, so the published package would never warn.
- The behavior rules are C-75 to C-81, each in the pull request of its code (P12): C-75 the evaluator is separate, C-76 pipeline, page mode and result, C-77 structural errors, C-78 semantics profile, C-79 the conformance suite ships, C-80 filters and search, C-81 `useLocalQuery`.

## Consequences

- The principles change: P1 says the consumer supplies the data and names the evaluator as an opt-in data source; P4, P9, P10 and P14 say where the evaluator sits. The size budget gets two fixtures, `protocol-local` and `local-composable` (P8).
- The protocol package gets a second API report (`etc/query-protocol-local.api.md`), and the Vue package a second one for its `/local` entry. The reports of the default entries do not change.
- The layer rule gains the `local` parts in both directions, and a check of the built entry graph stands next to it: the lint rule alone cannot see a path through a shared chunk.
- `semantics.md` is a draft until the filters and search land; `tr-1` freezes with 3.1.0.
- The backend aligns to the document, not the other way round. Its known divergences are tracked in `dolusoft/gecko-project-backend#1168`; until an endpoint passes the suite with zero applicable failures, moving a table to it may change what the table shows. An endpoint that passes only with entries in an allowlist is "partially aligned", not conformant.
- Passing the suite is necessary, not sufficient. When the local source and the endpoint differ in dataset semantics, source scope, snapshot or default order, a different result is use outside the contract, not a fault of either evaluator. The default order is an obligation of the data source: with `sort: null` the local evaluator keeps the order of `allRows`, so the local snapshot must come in the order the endpoint returns by default (a stable order field where needed).

## Trade-off

A separate API: the consumer calls `useLocalQuery` and binds its result, instead of switching the table to a local mode. In return, `rows` has one meaning everywhere, the table stays thin, and the meaning of a query is a written, tested document that a server can follow, instead of whatever a TanStack row model does in a given version.
