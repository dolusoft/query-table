import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

export default defineConfig(() =>
  mergeConfig(viteConfig, {
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
          test: {
            name: 'browser',
            include: ['tests/browser/**/*.browser.spec.ts'],
            setupFiles: ['tests/browser/setup.ts'],
            // Browser mode serves on this port. The default (63315) falls inside
            // a range Windows reserves for Hyper-V on some machines, and a fixed
            // port keeps the URL stable.
            api: { port: 51315, strictPort: true },
            browser: {
              enabled: true,
              provider: playwright(),
              headless: true,
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
)
