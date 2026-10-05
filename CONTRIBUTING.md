# Contributing

There is no demo app; the table is exercised through tests.

- `pnpm test` — unit tests (happy-dom), fast.
- `pnpm test:browser` — real-browser tests (Vitest Browser Mode, Playwright Chromium). **Headed by default**: a visible Chromium window opens, so you can watch the page under test. First run: `pnpm exec playwright install chromium`. Screenshots for manual inspection land in `tests/browser/__screenshots__/` (gitignored, never compared). The script runs Vitest under a time limit and retries once when the run hangs or the browser loses its connection (`BROWSER_TEST_TIMEOUT_MS`, `BROWSER_TEST_ATTEMPTS`); failing tests are never retried. Spec files run one after another in a single page on purpose, see the comment in `vitest.config.ts`.
- `pnpm test:browser:headless` — the same tests without a window. CI runs headless on its own (GitHub Actions sets `CI=true`); `HEADLESS=1` does the same for any other command.
- The browser tests serve on port 51315. If another clone already holds it, set `VITEST_BROWSER_PORT` to a free port.
- `pnpm test:browser:inspect` — same tests in a headed Chromium, in watch mode, with Vue DevTools and Vite DevTools attached. The last test's table stays mounted; narrow it with a file filter or `-t`, e.g. `pnpm test:browser:inspect popovers`.
  - Vue DevTools: the green pill at the bottom of the tested page (component tree, state, events, timeline). Client: `http://localhost:51315/__devtools__/`.
  - Vite DevTools: `http://localhost:51315/__devtools/` (or the dock icon on the tested page). Client authorization is off in this mode (the server stays on loopback), so there is no one-time code to paste. The module graph lists the modules of the page under test.
  - The Chromium also listens for CDP on `http://127.0.0.1:9333`, so an agent can attach to the page under test.
- Browser specs run one file at a time (`maxWorkers: 1`): several pages opening at once drop loopback connections on Windows and hang the run.
- The test skin that gives the plain markup a shadcn-vue look lives in `tests/browser/` (`test-skin.css`, `skin/`, `components/ui/`). It is test-only and never shipped. Regenerate it with `node tests/browser/gen-skin.ts` after editing `skin/theme.css` or `skin/mapping.css`; `tests/skin.spec.ts` fails when the generated file is stale or when the skin selects anything outside the DOM contract. `components/ui/` is shadcn-vue CLI output (`components.json`); add components with `pnpm dlx shadcn-vue@latest add <name>`.
- The contract has four mechanisms, each checked in CI:
  - `pnpm contract:check` — `CONTRACT.md` is generated from `src/contract.ts`, `contract/rules.md` and `contract/dom.ts` (`pnpm contract:gen`); it fails when the file is stale.
  - `pnpm api:check` — api-extractor compares the built `.d.ts` with `etc/vue-server-table.api.md` (`pnpm api:update` accepts a deliberate change).
  - Behavior rules `C-nn` in `contract/rules.md`: each needs a test with the ID in its name; `tests/contract-traceability.spec.ts` fails otherwise.
  - DOM contract: `tests/browser/dom-contract.browser.spec.ts` compares the rendered classes and attributes with `contract/dom.ts`.
- `pnpm check:package` also fails if any `.css` ends up in `dist/` or the tarball.
- `pnpm analyze:build` — the library build, written to `node_modules/.cache/analyze-dist` (not `dist/`), with Rolldown devtools output. It then serves Vite DevTools on `http://localhost:9999/__devtools-rolldown/`: modules, chunks, assets, packages and plugins of the build. Stop it with Ctrl+C.
