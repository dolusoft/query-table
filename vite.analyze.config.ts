import { defineConfig, mergeConfig } from 'vite'

import viteConfig from './packages/vue/vite.config.ts'

// Build analysis only (`pnpm analyze:build`): the same library build, written
// outside `dist/`, with Rolldown's devtools session output switched on so
// Vite DevTools' Rolldown panel can show modules, chunks and package sizes.
// The published build keeps reading vite.config.ts alone.
export default mergeConfig(
  viteConfig,
  defineConfig({
    devtools: true,
    build: {
      outDir: 'node_modules/.cache/analyze-dist',
      emptyOutDir: true,
      rolldownOptions: {
        devtools: {}
      }
    }
  })
)
