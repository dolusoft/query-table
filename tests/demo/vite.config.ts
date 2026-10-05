import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// `pnpm dev`: serves tests/demo with the test skin, for looking at the table
// by eye. The library build never reads this file.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, '../skin') }
  }
})
