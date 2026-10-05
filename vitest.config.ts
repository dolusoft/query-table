import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      include: ['tests/**/*.spec.ts'],
      setupFiles: ['tests/setup.ts'],
      css: false,
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
      }
    }
  })
)
