# vue-server-table

A thin Vue 3 table for server-side data. It renders the rows you give it and emits a single `change` event when the user sorts, filters or pages; fetching and ordering the data is up to you.

## Install

```bash
pnpm add https://github.com/dolusoft/vue-server-table/releases/download/v2.0.0/dolusoft-vue-server-table-2.0.0.tgz
```

Peer dependencies: `vue` 3.5+ and `floating-vue` (registered globally with `app.use(FloatingVue)`).

## Usage

```vue
<script setup lang="ts">
import VueServerTable from '@dolusoft/vue-server-table'

const columns = [{ field: 'name', title: 'Name' }]
const rows = ref([])
const total = ref(0)

async function onChange(params) {
  // params: current_page, pagesize, sort_column, sort_direction, column_filters, change_type
  const res = await fetchRows(params)
  rows.value = res.rows
  total.value = res.total
}
</script>

<template>
  <VueServerTable
    :rows="rows"
    :columns="columns"
    :total-rows="total"
    @change="onChange"
  />
</template>
```

## License

MIT

## Development

There is no demo app; the table is exercised through tests.

- `pnpm test` — unit tests (happy-dom), fast.
- `pnpm test:browser` — real-browser tests (Vitest Browser Mode, Playwright Chromium, headless). First run: `pnpm exec playwright install chromium`. Screenshots for manual inspection land in `tests/browser/__screenshots__/` (gitignored, never compared).
- `pnpm test:browser:inspect` — same tests in a headed Chromium, in watch mode, with Vue DevTools and Vite DevTools attached. The last test's table stays mounted; narrow it with a file filter or `-t`, e.g. `pnpm test:browser:inspect popovers`.
  - Vue DevTools: the green pill at the bottom of the tested page (component tree, state, events, timeline). Client: `http://localhost:51315/__devtools__/`.
  - Vite DevTools: `http://localhost:51315/__devtools/` (or the dock icon on the tested page). The first visit asks for the one-time code printed in the terminal; the printed `#devframe_otp=` link authorizes directly.
  - The Chromium also listens for CDP on `http://127.0.0.1:9333`, so an agent can attach to the page under test.
- `pnpm analyze:build` — the library build, written to `node_modules/.cache/analyze-dist` (not `dist/`), with Rolldown devtools output. It then serves Vite DevTools on `http://localhost:9999/__devtools-rolldown/`: modules, chunks, assets, packages and plugins of the build. Stop it with Ctrl+C.
