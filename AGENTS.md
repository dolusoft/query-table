# Agent guide

Read this before changing anything. It is short on purpose; the details live in the linked files.

## Where the rules are

- [PRINCIPLES.md](PRINCIPLES.md): the boundaries. A change that crosses one changes the principle first, in its own pull request, approved by a code owner.
- [docs/decisions/](docs/decisions/README.md): the v3 architecture decisions (ADRs). Do not work against one; propose a new record that supersedes it.
- [contract/rules.md](contract/rules.md): the behavior rules `C-nn`. Rule, test, code and generated docs move together (P12).
- [CONTRIBUTING.md](CONTRIBUTING.md): layout, commands, measuring, releasing.

## Branches

- `main` is 2.2.x and in production. Only small fixes go there.
- `next` is v3. Pull requests for v3 target `next`. Never force push.

## v3 layers (P14)

protocol → core → vue → playground. Imports point only that way.

- `@dolusoft/query-protocol`: zero dependencies. Types, rules, grammar, `parseFilterInput`.
- `@dolusoft/query-table-core`: `@tanstack/table-core` + protocol. Two plugins, `serverQueryFeature` and `filterInputFeature`, and `shared/`.
- `@dolusoft/query-table`: Vue. `useQueryTable` + `QueryTable`; public API and DOM contract as in 2.2.x.

## Plugin contract (ADR 0003, ADR 0004)

- A plugin implements TanStack's `TableFeature`. It never imports another plugin; shared code is `core/src/shared/` only (`beforeAction`, `dispatch(action, reason)`, `dispose`).
- The consumer owns lasting state (`v-model:query`, widths, pinning). TanStack state is a projection of props; never keep a second copy (P15).
- One user action gives one `update:query`; pending filter inputs go first, in one `filter` update (C-04, C-14).
- Every C-rule says where its behavior comes from: `tanstack` (configured) or `own` (our code).

## Do not

- Add a runtime dependency, or loosen the exact TanStack version pin (P11).
- Ship CSS or a styling prop (P5); add an unlisted DOM hook (P6).
- Fetch or touch storage in library code (P1).
- Edit `CONTRACT.md` or `contract/api.json` by hand (`pnpm contract:gen`).
- Change `PRINCIPLES.md`, `docs/decisions/`, `contract/rules.md`, the lint layer config, the budgets or `.github/` without a code owner's review (`.github/CODEOWNERS`).

## Pull requests

Use the template. The body must carry an `İlkeler:` line (the principles touched, or `yok`) and a `Katman:` line (the layers touched). CI fails without them. Commit messages and pull request bodies are written in Turkish; code, comments and repository docs in English.

## Before you push

`pnpm lint && pnpm typecheck && pnpm test && pnpm test:browser:headless && pnpm contract:check && pnpm schema:check && pnpm check:renders`. With a build: `pnpm build && pnpm check:package && pnpm check:deps && pnpm check:size && pnpm check:package-size && pnpm api:check && pnpm pack-install`.
