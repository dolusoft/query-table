import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import pkg from './package.json' with { type: 'json' }

// Every runtime and peer dependency stays external: the consumer resolves
// (and deduplicates) them, the library bundle only carries its own code.
const externalPackages = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {})
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
    lib: {
      entry: {
        'vue-server-table': resolve(
          import.meta.dirname,
          'src/components/index.ts'
        )
      },
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external
    }
  }
})
