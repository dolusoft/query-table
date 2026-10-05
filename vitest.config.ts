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
