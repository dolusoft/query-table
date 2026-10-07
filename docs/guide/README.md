# Query Table v3 guides

Short, example-first guides for the v3 packages. Every code sample is a file under [`examples/`](examples) that is type-checked, and the guides that show it are checked against it (see [How the samples are checked](#how-the-samples-are-checked)).

| Guide                                      | Read it when                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [Protocol](protocol.md)                    | you write a backend, or need the shape of a query: page and cursor mode, filters, search, schema |
| [Semantics (`tr-1`)](semantics.md)         | you evaluate a query over local rows, or align a server: matching, order, paging, errors        |
| [TanStack plugins](tanstack-plugins.md)    | you use TanStack Table and want `serverQueryFeature` and `filterInputFeature`                   |
| [Architecture](architecture.md)            | you want the layers, the state ownership, the size budgets and the reasons behind them          |
| [Migrating to 3.0](migration-v3.md)        | you run 2.2.x today (draft; includes the Vue package)                       |

Where to start: a backend developer reads the protocol guide; a TanStack user reads the plugin guide; a `QueryTable` user reads the migration guide.

The decisions behind v3 are in [`docs/decisions/`](../decisions/README.md), and the numbered behavior rules in [`contract/rules.md`](../../contract/rules.md).

## How the samples are checked

- `pnpm typecheck` compiles `examples/*.ts` with the rest of the repository.
- `pnpm exec vitest run --project unit docs` runs `guide.spec.ts`. It compares each code block that follows a `snippet` marker comment in the guides with the code in `examples/`, checks that relative links resolve, validates the JSON samples against the real JSON Schema, and runs the TypeScript examples.
- The .NET example in `examples/dotnet/` is built and run in CI: `dotnet run --project docs/guide/examples/dotnet -- <repo root>`. It needs the .NET 8 SDK.

To change a sample, edit the file in `examples/`, then copy the same text into the guide; the spec fails until they match.
