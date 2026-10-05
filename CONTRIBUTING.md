# Contributing

There is no demo app; the table is exercised through tests.

- `pnpm test` — unit tests (happy-dom), fast.
- `pnpm test:browser` — real-browser tests (Vitest Browser Mode, Playwright Chromium, headless). First run: `pnpm exec playwright install chromium`. Screenshots for manual inspection land in `tests/browser/__screenshots__/` (gitignored, never compared). The script runs Vitest under a time limit and retries once when the run hangs or the browser loses its connection (`BROWSER_TEST_TIMEOUT_MS`, `BROWSER_TEST_ATTEMPTS`); failing tests are never retried. Spec files run one after another in a single page on purpose, see the comment in `vitest.config.ts`.
- `pnpm test:browser:inspect` — same tests in a headed Chromium, in watch mode, with Vue DevTools and Vite DevTools attached. The last test's table stays mounted; narrow it with a file filter or `-t`, e.g. `pnpm test:browser:inspect popovers`.
  - Vue DevTools: the green pill at the bottom of the tested page (component tree, state, events, timeline). Client: `http://localhost:51315/__devtools__/`.
  - Vite DevTools: `http://localhost:51315/__devtools/` (or the dock icon on the tested page). The first visit asks for the one-time code printed in the terminal; the printed `#devframe_otp=` link authorizes directly.
  - The Chromium also listens for CDP on `http://127.0.0.1:9333`, so an agent can attach to the page under test.
- `pnpm analyze:build` — the library build, written to `node_modules/.cache/analyze-dist` (not `dist/`), with Rolldown devtools output. It then serves Vite DevTools on `http://localhost:9999/__devtools-rolldown/`: modules, chunks, assets, packages and plugins of the build. Stop it with Ctrl+C.
