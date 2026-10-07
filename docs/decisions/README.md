# Decisions

Architecture decision records (ADRs) for Query Table v3. Each record states the context, the decision, its consequences and the trade-off that was accepted. A record is not edited to change its decision: a new record supersedes it and says so.

Changing a record, or adding one, needs the approval of a code owner (`.github/CODEOWNERS`).

| ID                                          | Title                                                       | Status   |
| ------------------------------------------- | ----------------------------------------------------------- | -------- |
| [0001](0001-tanstack-v9.md)                 | Build v3 on TanStack Table v9                               | Accepted |
| [0002](0002-three-packages.md)              | Three packages: protocol, core, vue                         | Accepted |
| [0003](0003-two-plugins-shared-contract.md) | Two independent plugins and a shared action contract        | Accepted |
| [0004](0004-state-ownership.md)             | The consumer owns lasting state; TanStack holds projections | Accepted |
| [0005](0005-composable-and-component.md)    | `useQueryTable` and `QueryTable`, and the consumer fence    | Accepted |
| [0006](0006-release-3.md)                   | Releasing 3.0.0: the `next` branch and the equivalence gate | Accepted |
| [0007](0007-column-layout-row-pinning.md)   | Column layout and row pinning (3.1)                         | Accepted |
| [0008](0008-local-query-evaluation.md)      | Local query evaluation as a data source                     | Accepted |
| [0009](0009-npm-distribution.md)            | npm as the only package distribution channel                | Accepted |
| [0010](0010-virtual-and-infinite-scroll.md) | Virtual rows and infinite scroll (3.2)                      | Accepted |

Decided on 2026-10-06: K0–K5 with Zahid, D1–D9 after two independent reviews. These records are the version of those decisions that lives with the code.
