// `pnpm pack-install`: installs the three packed tarballs into a new app
// outside the workspace, the way the README tells a consumer to, then
// typechecks and builds that app, and runs the conformance suite of the
// installed protocol tarball (fixtures/pack-install/conformance.mjs: every
// hash of its manifest, two runs). Catches what the workspace hides: a
// `workspace:*` range left in a manifest, a file missing from `files`, a type
// that only resolves through the workspace `paths`, an override the README
// forgets.
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

  // 2. The README's overrides name every @dolusoft dependency of the Vue
  // package, and each points at the tarball of that name and version.
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const vue = packed['@dolusoft/query-table']
  const internal = Object.keys(vue.manifest.dependencies ?? {}).filter(name =>
    name.startsWith('@dolusoft/')
  )
  for (const name of internal) {
    const line = new RegExp(
      `^\\s+'${name.replaceAll('/', '\\/')}': (\\S+)$`,
      'm'
    ).exec(readme)
    if (!line) {
      fail(`README.md has no override for ${name}`)
    }
    if (!line[1].endsWith(`/v${packed[name].version}/${packed[name].file}`)) {
      fail(
        `README.md overrides ${name} with ${line[1]}, expected the v${packed[name].version} asset ${packed[name].file}`
      )
    }
  }
  if (!readme.includes(`/v${vue.version}/${vue.file}`)) {
    fail(`README.md does not install ${vue.file}`)
  }

  // 3. A consumer app: the overrides of the README with local tarballs.
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

import type { LocalQueryResult } from '@dolusoft/query-protocol/local'
import QueryTableDefault, { parseFilterInput, useQueryTable, type TableQuery } from '@dolusoft/query-table'

import App from './App.vue'

const rules = parseFilterInput('>5', { field: 'age', type: 'number' })
const query = ref<TableQuery>({ page: 1, pageSize: 10, sort: null, filters: rules })

export type LocalResult = LocalQueryResult<{ age: number }>

createApp({
  components: { QueryTableDefault },
  setup() {
    const state = useQueryTable({
      query,
      columns: [{ field: 'age', title: 'Age', type: 'number' }],
      rows: [{ age: 1 }],
      totalRows: 1,
      onQueryChange: next => {
        query.value = next
      }
    })
    return () => h('div', [h(App), String(state.pagination.value.pageCount)])
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
