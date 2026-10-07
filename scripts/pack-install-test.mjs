// `pnpm pack-install`: installs the three packed tarballs into a new app
// outside the workspace to simulate an npm install, then
// typechecks and builds that app, and runs the conformance suite of the
// installed protocol tarball (fixtures/pack-install/conformance.mjs: every
// hash of its manifest, two runs). Catches what the workspace hides: a
// `workspace:*` range left in a manifest, a file missing from `files`, a type
// that only resolves through the workspace `paths`, a stale README version.
//
//   node scripts/pack-install-test.mjs   (after `pnpm build`)
//
// The app goes to a new directory under PACK_INSTALL_DIR, else the system
// temporary directory, and is removed afterwards unless PACK_INSTALL_KEEP=1.
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'
import { createServer, preview } from 'vite'

const root = join(import.meta.dirname, '..')
const rootManifest = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8')
)
const tools = {
  ...rootManifest.dependencies,
  ...rootManifest.devDependencies
}

const fail = message => {
  console.error(`[pack-install] ${message}`)
  process.exit(1)
}

const run = (command, args, cwd) => {
  console.log(`[pack-install] ${command} ${args.join(' ')}`)
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    // pnpm is a .cmd on Windows.
    shell: process.platform === 'win32'
  })
}

const base = process.env.PACK_INSTALL_DIR ?? tmpdir()
mkdirSync(base, { recursive: true })
const work = mkdtempSync(join(base, 'query-table-pack-'))
const tarballs = join(work, 'tarballs')
const app = join(work, 'app')
mkdirSync(tarballs)
mkdirSync(join(app, 'src'), { recursive: true })

try {
  // 1. Pack: pnpm turns `workspace:*` into the version.
  const packed = {}
  for (const dir of ['query-protocol', 'query-table-core', 'vue']) {
    const before = new Set(readdirSync(tarballs))
    run(
      'pnpm',
      ['pack', '--pack-destination', tarballs],
      join(root, 'packages', dir)
    )
    const file = readdirSync(tarballs).find(name => !before.has(name))
    if (!file) {
      fail(`packages/${dir} produced no tarball`)
    }
    const manifest = JSON.parse(
      readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')
    )
    packed[manifest.name] = { file, version: manifest.version, manifest }
  }

  // 2. The README installs the Vue package by name at the packed version.
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const vue = packed['@dolusoft/query-table']
  const installs = [
    ...readme.matchAll(/^pnpm add @dolusoft\/query-table@(\S+)$/gm)
  ]
  if (installs.length !== 1 || installs[0][1] !== vue.version) {
    fail(`README.md must install @dolusoft/query-table@${vue.version}`)
  }
  const internal = Object.keys(vue.manifest.dependencies ?? {}).filter(name =>
    name.startsWith('@dolusoft/')
  )

  // 3. Simulate registry dependency resolution with local tarball overrides.
  const tarball = name => `file:../tarballs/${packed[name].file}`
  writeFileSync(
    join(app, 'pnpm-workspace.yaml'),
    [
      'overrides:',
      ...internal.map(name => `  '${name}': ${tarball(name)}`),
      ''
    ].join('\n')
  )
  writeFileSync(
    join(app, 'package.json'),
    `${JSON.stringify(
      {
        name: 'pack-install-app',
        private: true,
        type: 'module',
        // The app imports the protocol and the core by name too (pnpm
        // gives no access to undeclared dependencies).
        dependencies: {
          ...Object.fromEntries(internal.map(name => [name, tarball(name)])),
          '@dolusoft/query-table': tarball('@dolusoft/query-table'),
          vue: tools.vue
        },
        devDependencies: {
          '@vitejs/plugin-vue': tools['@vitejs/plugin-vue'],
          typescript: tools.typescript,
          vite: tools.vite,
          'vue-tsc': tools['vue-tsc']
        }
      },
      null,
      2
    )}\n`
  )
  writeFileSync(
    join(app, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: []
        },
        include: ['src/**/*.ts', 'src/**/*.vue']
      },
      null,
      2
    )}\n`
  )
  writeFileSync(
    join(app, 'vite.config.ts'),
    [
      "import vue from '@vitejs/plugin-vue'",
      "import { defineConfig } from 'vite'",
      '',
      'export default defineConfig({ plugins: [vue()] })',
      ''
    ].join('\n')
  )
  writeFileSync(
    join(app, 'index.html'),
    '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n'
  )
  writeFileSync(
    join(app, 'src', 'env.d.ts'),
    [
      "declare module '*.vue' {",
      "  import type { DefineComponent } from 'vue'",
      '  const component: DefineComponent',
      '  export default component',
      '}',
      ''
    ].join('\n')
  )
  // Both entry points of the Vue package, the cursor query, the protocol
  // and the core by name (the TanStack path), typed end to end.
  writeFileSync(
    join(app, 'src', 'App.vue'),
    `<script setup lang="ts">
import { ref } from 'vue'

import { parseFilterInput as parseRules } from '@dolusoft/query-protocol'
import { QueryTable, type Column, type CursorQuery, type RowSelection } from '@dolusoft/query-table'
import { serverQueryFeature } from '@dolusoft/query-table-core'

const columns: Column[] = [{ field: 'name', title: 'Name' }]
const query = ref<CursorQuery>({ cursor: null, pageSize: 10, sort: null, filters: [] })
const selection = ref<RowSelection>({})
const rows = [{ id: 1, name: 'a' }]
const parsed = parseRules('a*', { field: 'name' }).length + Object.keys(serverQueryFeature).length
</script>

<template>
  <QueryTable
    v-model:query="query"
    v-model:selection="selection"
    :columns="columns"
    :rows="rows"
    :total-rows="null"
    :cursors="{ next: null, prev: null }"
    row-key="id"
    sortable
    filterable
  >
    <template #toolbar="bar">
      <input :value="bar.search" @input="bar.setSearch(($event.target as HTMLInputElement).value)" />
      {{ parsed }}
    </template>
  </QueryTable>
</template>
`
  )
  writeFileSync(
    join(app, 'src', 'main.ts'),
    `import { createApp, h, ref } from 'vue'

import { defineDataset, type LocalQueryResult } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from '@dolusoft/query-table/local'
import QueryTableDefault, { parseFilterInput, useQueryTable, type TableQuery } from '@dolusoft/query-table'

import App from './App.vue'

const rules = parseFilterInput('>5', { field: 'age', type: 'number' })
const query = ref<TableQuery>({ page: 1, pageSize: 10, sort: null, filters: rules })

export type LocalResult = LocalQueryResult<{ age: number }>

createApp({
  components: { QueryTableDefault },
  setup() {
    const local = useLocalQuery({
      allRows: [{ age: 8 }],
      query,
      dataset: defineDataset<{ age: number }>({ key: 'age', fields: { age: { type: 'integer' } } }),
      profile: 'tr-1'
    })
    const diagnostic = useLocalQuery({
      allRows: [{ age: 8 }],
      query: { ...query.value, page: 0 },
      dataset: defineDataset<{ age: number }>({ key: 'age', fields: { age: { type: 'integer' } } }),
      profile: 'tr-1'
    })
    const state = useQueryTable({
      query,
      columns: [{ field: 'age', title: 'Age', type: 'number' }],
      rows: [{ age: 1 }],
      totalRows: 1,
      onQueryChange: next => {
        query.value = next
      }
    })
    return () => h('div', [h(App), String(state.pagination.value.pageCount), String(local.totalRows.value), local.error.value?.code, diagnostic.error.value?.code])
  }
}).mount('#app')
`
  )

  copyFileSync(
    join(root, 'fixtures', 'pack-install', 'conformance.mjs'),
    join(app, 'conformance.mjs')
  )

  // 4. Install, typecheck, build, run the conformance suite of the tarball.
  run('pnpm', ['install', '--prefer-offline'], app)
  run('pnpm', ['exec', 'vue-tsc', '--noEmit'], app)
  run('pnpm', ['exec', 'vite', 'build'], app)
  run('node', ['conformance.mjs'], app)
  // No bundler replacement and no process global: error reporting must not throw.
  writeFileSync(
    join(app, 'process-check.mjs'),
    `import { strict as assert } from 'node:assert'
import { effectScope } from 'vue'
import { defineDataset } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from '@dolusoft/query-table/local'
const runtime = globalThis.process
const scope = effectScope()
const log = console.error
let logged = 0
try {
  delete globalThis.process
  console.error = () => { logged++ }
  const local = scope.run(() => useLocalQuery({ allRows: [], query: { page: 0, pageSize: 1, sort: null, filters: [] }, dataset: defineDataset({ key: 'id', fields: { id: { type: 'integer' } } }), profile: 'tr-1' }))
  assert.equal(local.error.value.code, 'invalid-page')
  assert.equal(logged, 1)
} finally { globalThis.process = runtime; console.error = log; scope.stop() }
console.log('[pack-install] no process global: invalid-page returned and logged once, no ReferenceError')
`
  )
  run('node', ['process-check.mjs'], app)
  const server = await createServer({
    root: app,
    configFile: join(app, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 0 }
  })
  let browser
  try {
    await server.listen()
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    const diagnostics = []
    page.on('console', message => {
      if (
        message.type() === 'error' &&
        message.text().includes('[useLocalQuery]')
      ) {
        diagnostics.push(message.text())
      }
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(server.resolvedUrls.local[0])
    await page.locator('#app .qt-table').waitFor()
    if (errors.length) {
      fail('consumer dev server: ' + errors.join('; '))
    }
    if (diagnostics.length !== 1) {
      throw new Error('consumer dev server: expected one diagnostic')
    }
    console.log(
      '[pack-install] consumer dev server: mounted, invalid-page logged once, no page errors'
    )
    const production = await preview({
      root: app,
      configFile: join(app, 'vite.config.ts'),
      preview: { host: '127.0.0.1', port: 0 }
    })
    try {
      errors.length = 0
      diagnostics.length = 0
      await page.goto(production.resolvedUrls.local[0])
      await page.locator('#app .qt-table').waitFor()
      if (errors.length || diagnostics.length) {
        throw new Error('production consumer: unexpected error or diagnostic')
      }
      console.log(
        '[pack-install] production browser: invalid-page returned, no console.error, no process global'
      )
    } finally {
      await new Promise((resolve, reject) =>
        production.httpServer.close(error =>
          error ? reject(error) : resolve()
        )
      )
    }
  } finally {
    await browser?.close()
    await server.close()
  }
  console.log(
    `[pack-install] ok: ${Object.values(packed)
      .map(entry => entry.file)
      .join(
        ', '
      )} installed, typechecked, built and checked against the conformance suite outside the workspace`
  )
} finally {
  if (process.env.PACK_INSTALL_KEEP === '1') {
    console.log(`[pack-install] kept ${work}`)
  } else {
    rmSync(work, { recursive: true, force: true })
  }
}
