import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
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
          test: {
            name: 'unit',
            environment: 'happy-dom',
            include: ['tests/**/*.spec.ts'],
            exclude: ['tests/browser/**'],
            css: false
          }
        },
        {
          extends: true,
          // Tailwind builds the test skin (tests/browser/test-skin.css); the
          // library build never loads it.
          plugins: [tailwindcss(), ...(inspect ? [vueDevTools()] : [])],
          resolve: {
            alias: { '@': resolve(import.meta.dirname, 'tests/browser') }
          },
          devtools: inspect,
          test: {
            name: 'browser',
            include: ['tests/browser/**/*.browser.spec.ts'],
            // One page at a time. Several pages opening at once burst ~30
            // loopback WebSocket connections within 130ms; on Windows the first
            // SYN of some get dropped, the client reconnects too late and the
            // run hangs ("Failed to connect to the browser session"). It also
            // keeps the debounce-timing tests from competing for CPU.
            maxWorkers: 1,
            testTimeout: 15_000,
            hookTimeout: 15_000,
            teardownTimeout: 10_000,
            setupFiles: ['tests/browser/setup.ts'],
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
              provider: playwright(
                inspect
                  ? {
                      launchOptions: { args: ['--remote-debugging-port=9333'] }
                    }
                  : {}
              ),
              // Headed by default so a developer sees the page under test.
              // Headless in CI (GitHub Actions sets CI=true) or on request
              // (`pnpm test:browser:headless`, or HEADLESS=1).
              headless:
                !inspect &&
                (process.env.CI === 'true' || process.env.HEADLESS === '1'),
              ui: false,
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
