import { resolve } from 'node:path'

import { defineConfig } from 'vite'

import pkg from './package.json' with { type: 'json' }

// The protocol and TanStack are dependencies: the consumer's bundler
// resolves and deduplicates them, the build carries only our code. Each
// subpath is its own entry; shared/ becomes a chunk both plugins import, so
// a consumer of one plugin does not load the other (ADR 0003).
const externalPackages = Object.keys(pkg.dependencies)
const external = (id: string) =>
  externalPackages.some(name => id === name || id.startsWith(`${name}/`))

const src = (path: string) => resolve(import.meta.dirname, 'src', path)

export default defineConfig({
  build: {
    // Not minified on purpose: the consumer's bundler minifies the app.
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
    lib: {
      entry: {
        index: src('index.ts'),
        'server-query': src('features/server-query/index.ts'),
        'filter-input': src('features/filter-input/index.ts')
      },
      formats: ['es']
    },
    rollupOptions: {
      external,
      output: {
        manualChunks: (id: string) =>
          /[\\/]src[\\/]shared[\\/]/.test(id) ? 'shared' : undefined
      }
    }
  }
})
