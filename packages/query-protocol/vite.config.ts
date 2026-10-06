import { resolve } from 'node:path'

import { defineConfig } from 'vite'

// Zero dependencies: nothing is external, nothing is bundled but our code.
export default defineConfig({
  build: {
    // Not minified on purpose: the consumer's bundler minifies the app.
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
    lib: {
      entry: { 'query-protocol': resolve(import.meta.dirname, 'src/index.ts') },
      formats: ['es']
    }
  }
})
