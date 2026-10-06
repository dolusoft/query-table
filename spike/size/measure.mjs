// Consumer fixture sizes for spike/REPORT.md (P8 rewrite, SPEC-v3 D5), with
// the method of scripts/consumer-size.mjs: each fixture is built into a
// minified app (Vue and TanStack bundled) and its cost is the difference to
// a baseline app. Run `pnpm build` first (legacy-plus-composable imports the
// 2.2 package through its `exports`, i.e. dist/).
//
//   node spike/size/measure.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { build } from 'vite'

const root = join(import.meta.dirname, '..', '..')
const here = import.meta.dirname
if (!existsSync(join(root, 'dist', 'query-table.js'))) {
  console.error('[spike:size] dist/ is missing: run `pnpm build` first')
  process.exit(1)
}

const buildApp = async input => {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'warn',
    resolve: { alias: { '@dolusoft/query-table': root } },
    build: {
      write: false,
      minify: true,
      rolldownOptions: { input }
    }
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    entry => entry.output
  )
  const code = outputs
    .filter(file => file.type === 'chunk')
    .map(chunk => chunk.code)
    .join('\n')
  return {
    bytes: Buffer.byteLength(code),
    gzipBytes: gzipSync(code).length,
    brotliBytes: brotliCompressSync(code).length
  }
}

const apps = {}
for (const name of [
  'empty',
  'protocol',
  'core',
  'tanstack-only',
  'tanstack-no-sizing',
  'composable',
  'component',
  'legacy-plus-composable'
]) {
  apps[name] = await buildApp(join(here, `${name}.ts`))
}
apps['vue-only'] = await buildApp(
  join(root, 'fixtures', 'consumer', 'vue-only.ts')
)
apps['legacy'] = await buildApp(
  join(root, 'fixtures', 'consumer', 'with-table.ts')
)

const minus = (a, b) => ({
  bytes: apps[a].bytes - apps[b].bytes,
  gzipBytes: apps[a].gzipBytes - apps[b].gzipBytes,
  brotliBytes: apps[a].brotliBytes - apps[b].brotliBytes
})
const costs = {
  'protocol (vs empty)': minus('protocol', 'empty'),
  'core: table-core + plugins (vs empty)': minus('core', 'empty'),
  'TanStack only: vue-table (vs vue-only)': minus('tanstack-only', 'vue-only'),
  'composable: vue-table + plugins (vs vue-only)': minus(
    'composable',
    'vue-only'
  ),
  'sizing features (TanStack only vs no sizing)': minus(
    'tanstack-only',
    'tanstack-no-sizing'
  ),
  'plugins (composable vs TanStack only)': minus('composable', 'tanstack-only'),
  'spike component, lower bound (vs vue-only)': minus('component', 'vue-only'),
  '2.2 + composable, upper bound (vs vue-only)': minus(
    'legacy-plus-composable',
    'vue-only'
  ),
  '2.2.x component today (vs vue-only)': minus('legacy', 'vue-only')
}

const outDir = join(root, 'node_modules', '.cache', 'measure')
mkdirSync(outDir, { recursive: true })
writeFileSync(
  join(outDir, 'spike-size.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), apps, costs }, null, 2)}\n`
)
console.log(
  '                                                   bytes     gzip   brotli'
)
for (const [label, cost] of Object.entries(costs)) {
  console.log(
    `${label.padEnd(48)} ${String(cost.bytes).padStart(8)} ${String(cost.gzipBytes).padStart(8)} ${String(cost.brotliBytes).padStart(8)}`
  )
}
