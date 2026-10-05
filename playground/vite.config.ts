import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The playground: `pnpm dev` serves it, `pnpm playground:build` writes
// playground/dist. PLAYGROUND_BASE sets the public path (`/vue-server-table/`
// on GitHub Pages); routing uses the URL hash, so any base works. The
// library build never reads this file.
export default defineConfig({
  root: import.meta.dirname,
  base: process.env.PLAYGROUND_BASE ?? '/',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'skin') }
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true
  }
})
