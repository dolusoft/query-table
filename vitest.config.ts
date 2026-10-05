import { playwright } from '@vitest/browser-playwright'
import vueDevTools from 'vite-plugin-vue-devtools'
import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

// `vitest --mode inspect` (see the `test:browser:inspect` script) keeps a
// headed browser and the dev server up, with Vue DevTools and Vite DevTools
// attached. Nothing here reaches the library build: `vite build` only reads
// vite.config.ts.
export default defineConfig(({ mode }) => {
  const inspect = mode === 'inspect'

  return mergeConfig(viteConfig, {
    test: {
      coverage: {
        provider: 'v8',
        include: ['src/**'],
        reporter: ['text', 'json-summary', 'html'],
        reportsDirectory: 'coverage',
        // Measured 2026-10-05: lines 78.87, statements 79.2, branches 74.69, functions 69.16.
        // Floors sit a few points below so the suite passes today and guards regressions.
        thresholds: {
          lines: 75,
          statements: 76,
          branches: 71,
          functions: 66
        }
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'happy-dom',
            include: ['tests/**/*.spec.ts'],
            exclude: ['tests/browser/**'],
            setupFiles: ['tests/setup.ts'],
            css: false
          }
        },
        {
          extends: true,
          plugins: inspect ? [vueDevTools()] : [],
          devtools: inspect,
          test: {
            name: 'browser',
            include: ['tests/browser/**/*.browser.spec.ts'],
            setupFiles: ['tests/browser/setup.ts'],
            // One page at a time. By default each spec file gets its own page,
            // opened together, and the burst of simultaneous connections to the
            // dev server makes Windows drop a SYN now and then; when that hits a
            // page's first WebSocket, Vitest never recovers (see
            // scripts/test-browser.mjs). Three concurrent pages also fight over
            // the CPU, which made the debounce-timing assertions flaky.
            maxWorkers: 1,
            // Safety nets, off in inspect mode where a paused debugger is normal.
            ...(inspect
              ? {}
              : {
                  testTimeout: 15_000,
                  hookTimeout: 15_000,
                  teardownTimeout: 10_000
                }),
            // Browser mode serves on this port. The default (63315) falls inside
            // a range Windows reserves for Hyper-V on some machines, and a fixed
            // port gives the inspect mode a stable URL.
            api: { port: 51315, strictPort: true },
            browser: {
              enabled: true,
              // In inspect mode the headed Chromium also exposes CDP on 9333, so an
              // agent (or chrome://inspect) can attach to the very page under test.
              provider: playwright(
                inspect
                  ? {
                      launchOptions: { args: ['--remote-debugging-port=9333'] }
                    }
                  : {}
              ),
              headless: !inspect,
              ui: false,
              // Default is 60 s. A page that cannot reach the server is not
              // coming; fail in 15 s instead of idling.
              connectTimeout: inspect ? 60_000 : 15_000,
              screenshotDirectory: 'tests/browser/__screenshots__',
              // A desktop-sized viewport: the default is phone-sized, which
              // squeezes the table and distorts geometry assertions.
              viewport: { width: 1280, height: 800 },
              instances: [{ browser: 'chromium' }]
            }
          }
        }
      ]
    }
  })
})
