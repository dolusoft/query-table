import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import { llmsPlugin } from './build/llms-plugin'

// The playground: `pnpm dev` serves it, `pnpm playground:build` writes
// apps/playground/dist. PLAYGROUND_BASE sets the public path (`/query-table/`
// on GitHub Pages); routing uses the URL hash, so any base works. No package
// build reads this file.
const packages = resolve(import.meta.dirname, '../../packages')

export default defineConfig({
  root: import.meta.dirname,
  base: process.env.PLAYGROUND_BASE ?? '/',
  // llms.txt and llms-full.txt are generated into the build output on every
  // build (build/llms.ts), never committed, so they cannot go stale.
  plugins: [
    vue(),
    tailwindcss(),
    llmsPlugin(resolve(import.meta.dirname, '../..'))
  ],
  resolve: {
    // The examples import the packages by name, as a consumer does; here the
    // names answer with the sources (the same map as tsconfig.json).
    alias: [
      {
        find: /^@dolusoft\/query-table$/,
        replacement: resolve(packages, 'vue/src/index.ts')
      },
      {
        find: /^@dolusoft\/query-protocol$/,
        replacement: resolve(packages, 'query-protocol/src/index.ts')
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
      },
      { find: '@', replacement: resolve(import.meta.dirname, 'skin') }
    ]
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true
  }
})
