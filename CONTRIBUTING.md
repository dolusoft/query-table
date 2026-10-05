# Contributing

The table is exercised through tests and shown in the playground (`playground/`, `pnpm dev`).

## Layout

`src/` is organized by feature, and a feature keeps its own unit tests next to the code (`*.spec.ts`; they never reach `dist`).

- `query-table.vue` is the thin shell: it sets up the composables, provides the header context and draws the table. `index.ts` is the package entry, `contract.ts` holds the public types.
- `core/`: the query and the column helpers, `useQueryEmitter` (the only place that emits `update:query`), `useColumns`, and the context (`table-context.ts`) the header parts read.
- `filter/`, `sort/`, `pagination/`: one folder per feature, with its pure helpers (`filter-draft.ts`, `sort.ts`), its `use-<feature>` composables and its components (`filter-cell.vue`, `sort-button.vue`, `table-pagination.vue`).
- `header/` and `body/`: the structural parts of the table (`table-header.vue`, `table-body.vue`, `table-footer.vue`) with `use-expansion.ts` and `use-cell-view.ts`.
- `tests/` is organized by role: `browser/` (the real-browser specs), `contract/` (`contract-traceability.spec.ts`), `measure/` (the render counting scenarios) and `support/` (`mount-table.ts` for unit specs; `fixtures.ts`, `helpers.ts` and `setup.ts` for browser specs). Specs of the bare component import `fixtures.ts` only; `helpers.ts` renders the skinned harness.
- `playground/` is the playground app and everything it shares with the browser tests: `skin/` (the shadcn-vue + Tailwind skin and `skin.spec.ts`), `harness/` (`TestTable.vue`, `FilterMenu.vue`, `TablePager.vue`, `theme.ts`), `scenarios/` (columns, rows and the fake server, as factories without shared state), `examples/` (one live example per page; the page shows its source), `shell/` (page layout, API panel, rule list) and `manifest.ts` (which page shows which API member and rule).

Names: a folder is a feature; structural parts carry a `table-` prefix; composables are `use-<feature>[-<role>]`; a spec is named after the unit it tests.

## Commands

- `pnpm dev` — the playground: one page per user-facing feature, each with a live table, its source, the API members it shows and the rules it covers. `?theme=light|dark` pins the theme; the switch in the sidebar does the same. `pnpm playground:build` writes the static site to `playground/dist` (gitignored; `PLAYGROUND_BASE` sets the public path). The `Playground` workflow publishes it to GitHub Pages from `main`.
- `pnpm test` — unit tests (happy-dom), fast.
- `pnpm test:browser` — real-browser tests (Vitest Browser Mode, Playwright Chromium). **Headed by default**: a visible Chromium window opens, so you can watch the page under test. First run: `pnpm exec playwright install chromium`. Screenshots for manual inspection land in `tests/browser/__screenshots__/` (gitignored, never compared). The script runs Vitest under a time limit and retries once when the run hangs or the browser loses its connection (`BROWSER_TEST_TIMEOUT_MS`, `BROWSER_TEST_ATTEMPTS`); failing tests are never retried. Spec files run one after another in a single page on purpose, see the comment in `vitest.config.ts`.
- `pnpm test:browser:headless` — the same tests without a window. CI runs headless on its own (GitHub Actions sets `CI=true`); `HEADLESS=1` does the same for any other command.
- The browser tests serve on port 51315. If another clone already holds it, set `VITEST_BROWSER_PORT` to a free port.
- `pnpm test:browser:inspect` — same tests in a headed Chromium, in watch mode, with Vue DevTools and Vite DevTools attached. The last test's table stays mounted; narrow it with a file filter or `-t`, e.g. `pnpm test:browser:inspect popovers`.
  - Vue DevTools: the green pill at the bottom of the tested page (component tree, state, events, timeline). Client: `http://localhost:51315/__devtools__/`.
  - Vite DevTools: `http://localhost:51315/__devtools/` (or the dock icon on the tested page). Client authorization is off in this mode (the server stays on loopback), so there is no one-time code to paste. The module graph lists the modules of the page under test.
  - The Chromium also listens for CDP on `http://127.0.0.1:9333`, so an agent can attach to the page under test.
- Browser specs run one file at a time (`maxWorkers: 1`): several pages opening at once drop loopback connections on Windows and hang the run.
- The skin that gives the plain markup a shadcn-vue look lives in `playground/skin/` (`test-skin.css`, `theme.css`, `mapping.css`, `ui/`). The playground and the browser tests use it; it is never shipped. Regenerate it with `node playground/skin/gen-skin.ts` after editing `theme.css` or `mapping.css`; `playground/skin/skin.spec.ts` fails when the generated file is stale or when the skin selects anything outside the DOM contract. `ui/` is shadcn-vue CLI output (`components.json`, alias `@/ui`); add components with `pnpm dlx shadcn-vue@latest add <name>`.
- The contract has four mechanisms, each checked in CI:
  - `pnpm contract:check` — `CONTRACT.md` and `contract/api.json` are generated from `src/contract.ts`, `contract/rules.md` and `contract/dom.ts` (`pnpm contract:gen`); it fails when either file is stale. The playground's API panels and `playground/manifest.spec.ts` read `contract/api.json`: the spec fails when an API member or a rule has no page.
  - `pnpm api:check` — api-extractor compares the built `.d.ts` with `etc/query-table.api.md` (`pnpm api:update` accepts a deliberate change).
  - Behavior rules `C-nn` in `contract/rules.md`: each needs a test with the ID in its name; `tests/contract/contract-traceability.spec.ts` fails otherwise.
  - DOM contract: `tests/browser/dom-contract.browser.spec.ts` compares the rendered classes and attributes with `contract/dom.ts`.
- `pnpm check:package` also fails if any `.css` ends up in `dist/` or the tarball.
- `pnpm analyze:build` — the library build, written to `node_modules/.cache/analyze-dist` (not `dist/`), with Rolldown devtools output. It then serves Vite DevTools on `http://localhost:9999/__devtools-rolldown/`: modules, chunks, assets, packages and plugins of the build. Stop it with Ctrl+C.

## Measuring

Three scripts write small JSON files to `node_modules/.cache/measure/` (gitignored), so a person or an agent can read numbers instead of a UI. None of them leaves a server running.

- `pnpm measure:renders` — how many times each component re-renders in four fixed scenarios on a 1000-row dataset: `mount`, `filter` (type `Name 1`, Enter), `sort` (name ascending, then descending) and `page` (100 rows a page, three clicks on Next). Output: `renders.json`. The scenarios are in `tests/measure/renders.measure.ts`; they run as the `measure` Vitest project in a real browser (headed like the browser tests, `HEADLESS=1` for no window).
  - `scenarios.<name>.counts` has `mounts`, `updates` (the `updated` hook, by component) and `triggers` (the first reactive cause of each re-render, from `renderTriggered`); `libraryUpdates` is the sum for the table's own components. Counts are the same on every repetition (the run fails otherwise), so they can be compared across commits. `timings` are medians of five runs and noisy: report them, do not assert on them.
  - To count something else, add a scenario to the `scenarios` list in that file. The counting is a global mixin (`config.global.mixins`); it needs a development build of Vue, which the test server serves.
- `pnpm analyze:build:json` — builds the library with Rolldown's devtools output and condenses it into `build.json`: per output format (ES, CJS) the assets with raw and gzip size, chunks, packages, external modules, and every module with its source size, imports and importer count. Use it for "what is in the bundle and what did this change add". `pnpm analyze:build` shows the same data in a UI instead, and keeps its server (ports 9999 and 10000, one per format) until you stop it.
- `pnpm measure:consumer-size` — builds `dist/` and then two minified apps from `fixtures/consumer/` (one mounts the table, one is the same app without it), both importing the package by name. `consumer-size.json` gives their size and the difference, which is what the package adds to an application (Vue itself excluded by the subtraction). The size budget: the package cost, minified + gzip, was 7934 B in 2.2.6 and CI fails above 8331 B (that plus 5%). `pnpm check:size` runs the check on an existing `dist/` (`pnpm build` first); the number lives in `scripts/consumer-size-budget.json` and is raised only on purpose, in the change that adds the weight.

For anything the scripts do not answer, attach to the page under test in inspect mode (`pnpm test:browser:inspect`):

- Vite DevTools at `http://localhost:51315/__devtools/`, Vue DevTools in the page.
- CDP at `http://127.0.0.1:9333` (`/json/version` lists the browser WebSocket URL; Playwright `chromium.connectOverCDP('http://127.0.0.1:9333')` works). The table and the Vue DevTools hook (`__VUE_DEVTOOLS_GLOBAL_HOOK__`) live in the tester iframe (the frame whose URL carries `iframeId=`), not in the top frame.
- Inspect mode keeps the loopback-only dev server up until you stop it. Narrow it with a file filter so the table you want stays mounted, e.g. `pnpm test:browser:inspect popovers`.
