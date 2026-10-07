# Contributing

The table is exercised through tests and shown in the playground (`apps/playground/`, `pnpm dev`).

Read [`PRINCIPLES.md`](./PRINCIPLES.md) first: it lists the boundaries of the package and the check behind each one. A change that crosses a principle changes the principle first.

## Layout

`src/` is organized by feature, and a feature keeps its own unit tests next to the code (`*.spec.ts`; they never reach `dist`).

- `query-table.vue` is the thin shell: it sets up the composables, provides the header context and draws the table. `index.ts` is the package entry, `contract.ts` holds the public types.
- `core/`: the query and the column helpers, `useQueryEmitter` (the only place that emits `update:query`), `useColumns`, and the context (`table-context.ts`) the header parts read.
- `filter/`, `sort/`, `pagination/`: one folder per feature, with its pure helpers (`filter-draft.ts`, `sort.ts`), its `use-<feature>` composables and its components (`filter-cell.vue`, `sort-button.vue`, `table-pagination.vue`).
- `header/` and `body/`: the structural parts of the table (`table-header.vue`, `table-body.vue`, `table-footer.vue`) with `use-expansion.ts` and `use-cell-view.ts`.
- `tests/` is organized by role: `contract/` holds the behavior specs that use only the public API and run unchanged against any build of the package (`contract/unit/` in happy-dom, `contract/browser/` in a real browser); `repo/` the repository checks (`contract-traceability.spec.ts`, `package-manifest.spec.ts`, `pr-body.spec.ts`); `measure/` the render counting scenarios; `support/` the helpers (`mount-table.ts` for unit specs; `fixtures.ts`, `helpers.ts` and `setup.ts` for browser specs; `trace.ts` records every `update:query` of a test). Specs of the bare component import `fixtures.ts` only; `helpers.ts` renders the skinned harness. Unit specs in `src/` are internal: they test composables and helpers and may change with the implementation.
- Tests, the playground and its harness import the package by name, `@dolusoft/query-table`, never `packages/*/src/` (except the internal specs in `src/`). `vitest.config.ts`, `apps/playground/vite.config.ts` and `tsconfig.json` point the name at `packages/vue/src/index.ts`; `QT_TARGET` points the test run at a built entry instead, which is how `pnpm equivalence` compares two builds.
- `apps/playground/` is the playground app and everything it shares with the browser tests: `skin/` (the shadcn-vue + Tailwind skin and `skin.spec.ts`), `harness/` (`TestTable.vue`, `FilterMenu.vue`, `TablePager.vue`, `theme.ts`), `scenarios/` (columns, rows and the fake server, as factories without shared state), `examples/` (one live example per page; the page shows its source), `shell/` (page layout, API panel, rule list) and `manifest.ts` (which page shows which API member and rule).

Names: a folder is a feature; structural parts carry a `table-` prefix; composables are `use-<feature>[-<role>]`; a spec is named after the unit it tests.

## Commands

- `pnpm dev` — the playground: one page per user-facing feature, each with a live table, its source, the API members it shows and the rules it covers. `?theme=light|dark` pins the theme; the switch in the sidebar does the same. `pnpm playground:build` writes the static site to `apps/playground/dist` (gitignored; `PLAYGROUND_BASE` sets the public path). The `Playground` workflow publishes it to GitHub Pages from `main`.
- `pnpm test` — unit tests (happy-dom), fast.
- `pnpm test:browser` — real-browser tests (Vitest Browser Mode, Playwright Chromium). **Headed by default**: a visible Chromium window opens, so you can watch the page under test. First run: `pnpm exec playwright install chromium`. Screenshots for manual inspection land in `tests/contract/browser/__screenshots__/` (gitignored, never compared). The script runs Vitest under a time limit and retries once when the run hangs or the browser loses its connection (`BROWSER_TEST_TIMEOUT_MS`, `BROWSER_TEST_ATTEMPTS`); failing tests are never retried. Spec files run one after another in a single page on purpose, see the comment in `vitest.config.ts`.
- `pnpm test:browser:headless` — the same tests without a window. CI runs headless on its own (GitHub Actions sets `CI=true`); `HEADLESS=1` does the same for any other command.
- The browser tests serve on port 51315. If another clone already holds it, set `VITEST_BROWSER_PORT` to a free port.
- `pnpm test:browser:inspect` — same tests in a headed Chromium, in watch mode, with Vue DevTools and Vite DevTools attached. The last test's table stays mounted; narrow it with a file filter or `-t`, e.g. `pnpm test:browser:inspect popovers`.
  - Vue DevTools: the green pill at the bottom of the tested page (component tree, state, events, timeline). Client: `http://localhost:51315/__devtools__/`.
  - Vite DevTools: `http://localhost:51315/__devtools/` (or the dock icon on the tested page). Client authorization is off in this mode (the server stays on loopback), so there is no one-time code to paste. The module graph lists the modules of the page under test.
  - The Chromium also listens for CDP on `http://127.0.0.1:9333`, so an agent can attach to the page under test.
- Browser specs run one file at a time (`maxWorkers: 1`): several pages opening at once drop loopback connections on Windows and hang the run.
- The skin that gives the plain markup a shadcn-vue look lives in `apps/playground/skin/` (`test-skin.css`, `theme.css`, `mapping.css`, `ui/`). The playground and the browser tests use it; it is never shipped. `mapping.css` is written into `@layer components`, so a Tailwind utility class on a page (for example `[&_.qt-table]:w-max` on a wrapper) overrides it; do not work around the skin with scoped CSS. Regenerate it with `node playground/skin/gen-skin.ts` after editing `theme.css` or `mapping.css`; `apps/playground/skin/skin.spec.ts` fails when the generated file is stale or when the skin selects anything outside the DOM contract. `ui/` is shadcn-vue CLI output (`components.json`, alias `@/ui`); add components with `pnpm dlx shadcn-vue@latest add <name>`.
- The contract has four mechanisms, each checked in CI:
  - `pnpm contract:check` — `CONTRACT.md` and `contract/api.json` are generated from `packages/vue/src/contract.ts`, `contract/rules.md` and `contract/dom.ts` (`pnpm contract:gen`); it fails when either file is stale. The playground's API panels and `apps/playground/manifest.spec.ts` read `contract/api.json`: the spec fails when an API member or a rule has no page.
  - `pnpm api:check` — api-extractor compares the built `.d.ts` of each package with its report, `packages/<name>/etc/<package>.api.md` (`scripts/api-report.mjs`; `pnpm api:update` accepts a deliberate change). It reads `dist/`, so run `pnpm build` first; the same build serves `check:package`, `check:size`, `check:package-size` and `pack-install`.
  - Behavior rules `C-nn` in `contract/rules.md`: each needs a runnable `it`/`test` with the ID in its name or in the name of the `describe` around it; an empty `describe`, a `.skip` and a `.todo` count for nothing. `tests/repo/contract-traceability.spec.ts` fails otherwise.
  - DOM contract: `tests/contract/browser/dom-contract.browser.spec.ts` compares the rendered classes and attributes with `contract/dom.ts`.
- `pnpm equivalence` — runs `tests/contract/**` (unit and browser, headless) against two builds and compares every test's result and its `update:query` sequence (reason and query, in order). It exits 1 on any difference and writes `.equivalence/report.json` (gitignored). `--baseline` defaults to `git:origin/main` (the ref is exported, built and packed like a release), `--candidate` to `src`; either also takes `release:<version>` (the tarball of a GitHub release) or `tgz:<path>`. `--unit-only` and `--browser-only` narrow the run. Tests of behavior a 2.2.x baseline does not have (the v3 additions, C-56 to C-66: cursor paging, search, selection, `useQueryTable`) are listed in `ADDED_AFTER_BASELINE` in the script, by file and test name (or `describe` title): they are not compared and may fail on the baseline, but the candidate must pass them. An entry that matches no test fails the run. v3 is released only when it shows no difference against the 2.2.x baseline (ADR 0006).
- `pnpm check:package` (after `pnpm build`) also fails if any `.css` ends up in `dist/` or the tarball, and runs publint and `attw --profile esm-only` on each package. The packages are ESM only: there is no CommonJS build.
- `pnpm pack-install` (after `pnpm build`) packs the three packages, installs the tarballs into a new app outside the workspace with the `overrides` the README shows, then typechecks and builds that app. It also fails when the README's install lines do not name the packed files. The app goes to a new directory under `PACK_INSTALL_DIR` (else the system temporary directory) and is removed afterwards unless `PACK_INSTALL_KEEP=1`.
- `tests/repo/package-manifest.spec.ts` fails when `package.json` gains a runtime dependency or a second peer. ESLint fails on network or storage access (`fetch`, `localStorage`, ...) in `src/`.
- `tests/contract/browser/accessibility.browser.spec.ts` runs an axe-core scan of the table in light and dark themes; any violation fails the browser tests.
- `pnpm analyze:build` — the library build, written to `node_modules/.cache/analyze-dist` (not `dist/`), with Rolldown devtools output. It then serves Vite DevTools on `http://localhost:9999/__devtools-rolldown/`: modules, chunks, assets, packages and plugins of the build. Stop it with Ctrl+C.

## Measuring

Three scripts write small JSON files to `node_modules/.cache/measure/` (gitignored), so a person or an agent can read numbers instead of a UI. None of them leaves a server running.

- `pnpm measure:renders` — how many times each component re-renders in five fixed scenarios on a 1000-row dataset: `mount`, `filter` (type `Name 1`, Enter), `sort` (name ascending, then descending), `loading` (100 rows a page, `loading` on and off) and `page` (100 rows a page, three clicks on Next). Output: `renders.json`. The scenarios are in `tests/measure/renders.measure.ts`; they run as the `measure` Vitest project in a real browser (headed like the browser tests, `HEADLESS=1` for no window). `pnpm check:renders` runs the same scenarios and fails when a scenario applies a different number of updates or re-renders the table more often than `scripts/render-budget.json` allows; CI runs it.
  - `scenarios.<name>.counts` has `mounts`, `updates` (the `updated` hook, by component) and `triggers` (the first reactive cause of each re-render, from `renderTriggered`); `libraryUpdates` is the sum for the table's own components. Counts are the same on every repetition (the run fails otherwise), so they can be compared across commits. `timings` are medians of five runs and noisy: report them, do not assert on them.
  - To count something else, add a scenario to the `scenarios` list in that file. The counting is a global mixin (`config.global.mixins`); it needs a development build of Vue, which the test server serves.
- `pnpm analyze:build:json` — builds the library with Rolldown's devtools output and condenses it into `build.json`: the assets with raw and gzip size, chunks, packages, external modules, and every module with its source size, imports and importer count. Use it for "what is in the bundle and what did this change add". `pnpm analyze:build` shows the same data in a UI instead, and keeps its server (port 9999) until you stop it.
- `pnpm measure:consumer-size` — builds `dist/` and then minified apps from `fixtures/consumer/`: `composable` (`useQueryTable()` with its own markup), `component` (`QueryTable`) and `vue-only`, the same app without the table, all importing the package by name. `consumer-size.json` gives each fixture's cost, the fixture minus `vue-only`: what the package with TanStack, the core and the protocol adds to an application. `pnpm check:size` runs the check on an existing `dist/` (`pnpm build` first) against `scripts/consumer-size-budget.json`: each budget is the last measure plus 5%, under a ceiling, and is raised only on purpose, in the change that adds the weight, with its reason in the history (2.2.12 added 10815 B; the history keeps it). `pnpm measure:package-size` and `pnpm check:package-size` do the same for the protocol and core fixtures (`fixtures/packages/`, `scripts/package-size-budget.json`).

For anything the scripts do not answer, attach to the page under test in inspect mode (`pnpm test:browser:inspect`):

- Vite DevTools at `http://localhost:51315/__devtools/`, Vue DevTools in the page.
- CDP at `http://127.0.0.1:9333` (`/json/version` lists the browser WebSocket URL; Playwright `chromium.connectOverCDP('http://127.0.0.1:9333')` works). The table and the Vue DevTools hook (`__VUE_DEVTOOLS_GLOBAL_HOOK__`) live in the tester iframe (the frame whose URL carries `iframeId=`), not in the top frame.
- Inspect mode keeps the loopback-only dev server up until you stop it. Narrow it with a file filter so the table you want stays mounted, e.g. `pnpm test:browser:inspect popovers`.

## Releasing

A release is a version in `package.json` and a tag that names it; the `Release` workflow (`.github/workflows/release.yml`) does the rest. Releases are made from `main`, which is the released 3.x line:

- A patch release (`3.0.1`) is a fix made directly on `main`, in its own pull request, and then merged into `next`.
- A minor release (`3.1.0`) is the work collected on `next`: `next` is merged into `main` in one pull request (a merge commit) and released from there.

1. In the pull request that `main` will release (the fix, or `next` → `main`), set `version` in the root `package.json` and in every `packages/*/package.json` to the new version; the three packages are versioned together (P9). Update the install lines of `README.md` to the same version (`tests/repo/package-manifest.spec.ts` fails when they differ).
2. After the pull request is merged, tag the merge commit on `main` and push the tag:

   ```bash
   git switch main && git pull
   git tag v<version>
   git push origin v<version>
   ```

3. The workflow fails when the tag is not `v` plus the version of the root `package.json` and of every `packages/*/package.json` (the three packages are released together). It runs every check of CI, builds, packs each package and creates one GitHub Release for the tag with the three tarballs attached (`dolusoft-query-protocol-<version>.tgz`, `dolusoft-query-table-core-<version>.tgz`, `dolusoft-query-table-<version>.tgz`), then fails unless every asset URL answers 200. Consumers install those URLs (see `README.md`).
4. Optionally the workflow sends a `repository_dispatch` with event type `query-table-released` and the payload `{ version, tarballUrl }` to one consumer repository, so that it can open its upgrade pull request. It does so only when the repository secret `CONSUMER_DISPATCH_TOKEN` (a token allowed to dispatch to that repository) and the repository variable `CONSUMER_REPO` (`owner/name`) are both set; otherwise the step logs that it skipped and the release still succeeds. The receiving workflow should be idempotent: a re-run of the same tag sends the same event again.

The workflow has three jobs: `verify` runs the checks and packs with a read-only token, `publish` (the only job with write access, no install) creates the release from the packed tarballs, and `npm` publishes the same tarballs to npm (`@dolusoft/query-protocol`, `@dolusoft/query-table-core`, `@dolusoft/query-table`, in that order). `npm` uses trusted publishing: no npm token or OTP is stored, each package on npmjs.com trusts this repository and `release.yml`, and provenance is attached. A version already on npm is skipped, so a re-run is safe; `npm` and `publish` do not depend on each other. The dispatch payload's `tarballUrl` is the Vue tarball. A failed run can be re-run on the same tag: an existing release gets its tarballs replaced, nothing else, and only when the tag still names the commit of the run; otherwise the run fails.
