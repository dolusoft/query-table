import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'
import vueDevTools from 'vite-plugin-vue-devtools'
import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './packages/vue/vite.config.ts'

// `vitest --mode inspect` (see the `test:browser:inspect` script) keeps a
// headed browser and the dev server up, with Vue DevTools and Vite DevTools
// attached. Nothing here reaches the library build: `vite build` only reads
// vite.config.ts.
export default defineConfig(({ mode }) => {
  const inspect = mode === 'inspect'

  // Tests import the package by its name. By default the name answers with
  // the source; QT_TARGET points it at a built entry instead (a `dist/*.js`
  // of a packed tarball), so `scripts/equivalence.mjs` can run the same
  // contract specs against two builds.
  const packageEntry = process.env.QT_TARGET
    ? resolve(process.env.QT_TARGET)
    : resolve(import.meta.dirname, 'packages/vue/src/index.ts')
  // The v3 workspace packages answer with their source too (the same map as
  // the `paths` of tsconfig.json).
  const packages = resolve(import.meta.dirname, 'packages')
  const packageAlias = [
    { find: /^@dolusoft\/query-table$/, replacement: packageEntry },
    {
      find: /^@dolusoft\/query-table\/local$/,
      replacement: resolve(packages, 'vue/src/local/index.ts')
    },
    {
      find: /^@dolusoft\/query-protocol$/,
      replacement: resolve(packages, 'query-protocol/src/index.ts')
    },
    {
      find: /^@dolusoft\/query-protocol\/local$/,
      replacement: resolve(packages, 'query-protocol/src/local/index.ts')
    },
    {
      find: /^@dolusoft\/query-protocol\/query\.schema\.json$/,
      replacement: resolve(packages, 'query-protocol/query.schema.json')
    },
    {
      find: /^@dolusoft\/query-table-core$/,
      replacement: resolve(packages, 'query-table-core/src/index.ts')
    },
    {
      find: /^@dolusoft\/query-table-core\/([\w-]+)$/,
      replacement: resolve(
        packages,
        'query-table-core/src/features/$1/index.ts'
      )
    }
  ]
  const skinAlias = {
    find: '@',
    replacement: resolve(import.meta.dirname, 'apps/playground/skin')
  }

  // The real-browser projects share everything but their name and files:
  // `browser` holds the tests, `measure` the render counting behind
  // `pnpm measure:renders` (not a test run, so `pnpm test:browser` skips it).
  const browserProject = (name: string, include: string[]) => ({
    extends: true as const,
    // Tailwind builds the test skin (apps/playground/skin/test-skin.css); the
    // library build never loads it.
    plugins: [tailwindcss(), ...(inspect ? [vueDevTools()] : [])],
    resolve: {
      alias: [...packageAlias, skinAlias]
    },
    // Inspect mode only: no one-time code to paste for a local session.
    // The dev server stays bound to loopback.
    devtools: inspect ? { clientAuth: false } : false,
    // Vitest adds its `ssr` and `__vitest__` environments ahead of the
    // `client` one, and the Vite DevTools UI reads the first environment
    // in the list. Without this line its module graph shows "0 of 0"
    // while the browser tests run in `client`.
    environments: { client: {} },
    test: {
      name,
      include,
      // One page at a time. Several pages opening at once burst ~30
      // loopback WebSocket connections within 130ms; on Windows the first
      // SYN of some get dropped, the client reconnects too late and the
      // run hangs ("Failed to connect to the browser session"). It also
      // keeps the debounce-timing tests from competing for CPU.
      maxWorkers: 1,
      testTimeout: 15_000,
      hookTimeout: 15_000,
      teardownTimeout: 10_000,
      setupFiles: ['tests/support/setup.ts', 'tests/support/trace.ts'],
      // Browser mode serves on this port. The default (63315) falls inside
      // a range Windows reserves for Hyper-V on some machines, and a fixed
      // port gives the inspect mode a stable URL.
      // VITEST_BROWSER_PORT lets two clones run browser tests at once.
      api: {
        port: Number(process.env.VITEST_BROWSER_PORT ?? 51315),
        strictPort: true
      },
      browser: {
        enabled: true,
        // In inspect mode the headed Chromium also exposes CDP on 9333, so an
        // agent (or chrome://inspect) can attach to the very page under test.
        // `colorScheme: null` turns off Playwright's default light emulation,
        // so the headed page follows the OS theme like a real browser does.
        provider: playwright({
          contextOptions: { colorScheme: null },
          ...(inspect
            ? { launchOptions: { args: ['--remote-debugging-port=9333'] } }
            : {})
        }),
        // Headed by default so a developer sees the page under test.
        // Headless in CI (GitHub Actions sets CI=true) or on request
        // (`pnpm test:browser:headless`, or HEADLESS=1).
        headless:
          !inspect &&
          (process.env.CI === 'true' || process.env.HEADLESS === '1'),
        ui: false,
        screenshotDirectory: 'tests/contract/browser/__screenshots__',
        // A desktop-sized viewport: the default is phone-sized, which
        // squeezes the table and distorts geometry assertions.
        viewport: { width: 1280, height: 800 },
        instances: [{ browser: 'chromium' }]
      }
    }
  })

  return mergeConfig(viteConfig, {
    test: {
      coverage: {
        provider: 'v8',
        include: ['packages/vue/src/**'],
        exclude: ['packages/vue/src/**/*.spec.ts'],
        reporter: ['text', 'json-summary', 'html'],
        reportsDirectory: 'coverage',
        // Measured 2026-10-05 (unit project): lines 98.3, statements 98.39, branches 96.48,
        // functions 97.94. Floors sit a few points below so the suite passes today and
        // guards regressions.
        thresholds: {
          lines: 95,
          statements: 95,
          branches: 93,
          functions: 94
        }
      },
      projects: [
        {
          extends: true,
          // apps/playground/skin/parity.spec.ts imports the shadcn-vue Button and
          // Badge variants; their components import `@/lib/utils`.
          resolve: {
            alias: [...packageAlias, skinAlias]
          },
          test: {
            name: 'unit',
            setupFiles: ['tests/support/trace.ts'],
            environment: 'happy-dom',
            // Unit specs sit next to the code they test (src/<feature>/);
            // the behavior specs that use only the public API sit in tests/contract/unit,
            // the repository checks in tests/repo, the playground ones in playground/.
            include: [
              'packages/vue/src/**/*.spec.ts',
              'tests/**/*.spec.ts',
              'apps/playground/**/*.spec.ts',
              // The v3 packages: pure unit tests, no DOM needed.
              'packages/*/src/**/*.spec.ts',
              'packages/*/tests/**/*.spec.ts',
              // The guides: their code samples are compiled by `pnpm
              // typecheck` and run here (docs/guide/guide.spec.ts).
              'docs/guide/**/*.spec.ts'
            ],
            exclude: ['tests/contract/browser/**'],
            css: false
          }
        },
        browserProject('browser', [
          'tests/contract/browser/**/*.browser.spec.ts'
        ]),
        browserProject('measure', ['tests/measure/**/*.measure.ts'])
      ]
    }
  })
})
