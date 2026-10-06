import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import pkg from './package.json' with { type: 'json' }

// Vue (a peer), the protocol, the core and TanStack are resolved and
// deduplicated by the consumer's bundler; the library bundle only carries its
// own code.
const externalPackages = [
  ...Object.keys(pkg.peerDependencies),
  ...Object.keys(pkg.dependencies)
]
const external = (id: string) =>
  externalPackages.some(name => id === name || id.startsWith(`${name}/`))

export default defineConfig({
  plugins: [vue()],
  build: {
    // Not minified on purpose: the consumer's bundler minifies the final app,
    // and readable output keeps stack traces into the library usable.
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
    lib: {
      entry: {
        'query-table': resolve(import.meta.dirname, 'src/index.ts'),
        local: resolve(import.meta.dirname, 'src/local/index.ts')
      },
      // ESM only: every maintained bundler and Node (`require(esm)`) reads it.
      formats: ['es']
    },
    rollupOptions: { external }
  }
})
