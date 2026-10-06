# Migrating from 2.2.x to 3.0

> **Draft.** 3.0.0 is not released, and this page is written against the protocol and core packages (`3.0.0-next.0`). The Vue package section is completed in PR-C, when `@dolusoft/query-table` 3.0 lands. See [Known open items](#known-open-items).

3.0 splits the implementation into three packages and adds cursor paging, row selection and global search. If you use the `QueryTable` component, the goal is that **you bump the package version and change nothing else**: the component's props, events and DOM contract stay those of 2.2.x, and 3.0.0 ships only when a gate that runs the same behavior tests against 2.2.x and 3.0 finds zero differences ([ADR 0006](../decisions/0006-release-3.md)).

## Install

| You use                                   | You install                                                          | Code change                                  |
| ----------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| the `QueryTable` component                | `@dolusoft/query-table` 3.0 (it brings the other two as dependencies) | none                                         |
| TanStack Table and our plugins            | `@dolusoft/query-table-core` (it brings the protocol)                | new: see the [plugin guide](tanstack-plugins.md) |
| the query types or schema on a backend    | `@dolusoft/query-protocol` alone                                     | new: see the [protocol guide](protocol.md)   |

The package that was one in 2.2 is now three, versioned together ([ADR 0002](../decisions/0002-three-packages.md)). The Vue package keeps its name, so existing imports keep working:

```ts
import QueryTable, { type TableQuery } from '@dolusoft/query-table'
```

`TableQuery` stays as an alias of `PageQuery`, the page-mode query, so a 2.2 type annotation compiles unchanged. New code that accepts either mode uses `Query` from `@dolusoft/query-protocol`.

The Node and `vue` requirements of 2.2 (Node 22.12 or newer, `vue` 3.5+) are unchanged for the packages.

## What is new

Everything below is opt-in. A 2.2 query has the same shape and means the same.

- **Cursor paging.** A query with a `cursor` key is in cursor mode: the server pages by opaque cursors, and the total may be unknown. See [Cursor mode](protocol.md) in the protocol guide and C-56 and C-57 in `contract/rules.md`.
- **Global search.** `search` holds the text; a change emits the new reason `search`. An empty text removes the key (C-58).
- **Row selection.** The selection is yours: a map of row key to `true`, passed in and drawn as given. It never emits a query (C-59).
- **The JSON Schema.** `@dolusoft/query-protocol/query.schema.json` describes a query for a backend, in any language.
- **TanStack plugins.** `serverQueryFeature` and `filterInputFeature` work on a plain TanStack table, without our component.

## Behavior changes

The rules C-01 to C-55 keep their text; a comparison of `contract/rules.md` with its 2.2 version shows only added `Source:` lines and the new rules C-56 to C-62. The changes you can notice:

### Unknown query keys are kept (C-60)

In 2.2 the table copied a query field by field, so a key it did not know was **dropped** from every query it emitted. In 3.0 it is **kept**, in every emitted query, and it counts when two queries are compared. The same holds for properties of a rule besides `field`, `condition` and `value`.

```ts
// You hand the table:
const query = { page: 1, pageSize: 10, sort: null, filters: [], tenant: 'acme' }
// 2.2 emitted { page: 2, pageSize: 10, sort: null, filters: [] }
// 3.0 emits   { page: 2, pageSize: 10, sort: null, filters: [], tenant: 'acme' }
```

This is the one change that can alter what your backend receives. If you relied on the table stripping extra keys, strip them yourself before sending. If you worked around the stripping by re-adding a key in your `update:query` handler, you can delete the workaround.

### One more reason, `search`

`QueryChangeReason` gains `search`. A `switch` over the reasons that must be exhaustive needs a new branch; a handler that does not use `search` never sees it, because global search is only active when you use it.

### Plugin options are guarded

Applies to the TanStack plugins only, not to the component. `serverQueryFeature` throws when the table options replace the handlers or `manual*` options it owns (C-61), and a disposed table is inert (C-62). Both are new in 3.0, because there was no plugin in 2.2.

## Known open items

- The **Vue package** section is incomplete: the exact 3.0 install command and release location, the `QueryTable` props that cursor mode, search and selection add, and the `useQueryTable()` composable are written in PR-C, when the package lands. Until then, treat the "no code change" promise above as the goal that the equivalence gate enforces, not as a finished claim.
- Render counts are reported by the gate, not compared; v3 re-baselines them, so a performance test that counts renders can need new numbers.
- The page is a draft until Zahid approves the principle text and 3.0.0 ([ADR 0006](../decisions/0006-release-3.md)).
