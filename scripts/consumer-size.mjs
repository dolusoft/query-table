// `pnpm measure:consumer-size`: how much a Vue application that uses
// `@dolusoft/query-table` ships (P8). Builds minified apps from
// fixtures/consumer against the built `dist/` of the packages, through their
// `exports` maps, and subtracts the same app without the table
// (`vue-only`): what is left is the package with TanStack, the core and the
// protocol, Vue excluded. Two fixtures: `composable` (`useQueryTable()` with
// the consumer's own markup) and `component` (`QueryTable`). Writes
// node_modules/.cache/measure/consumer-size.json. Run after `pnpm build`
// (the package script does).
//
// `--check` (CI) compares each gzip cost with scripts/consumer-size-budget.json
// and exits 1 when one is over its budget or a budget is over the ceiling of
// its fixture. A deliberate growth raises budget and ceiling in the same
// change, with its reason in the history (K7).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { build } from 'vite'

const root = join(import.meta.dirname, '..')
const outDir = join(root, 'node_modules', '.cache', 'measure')
const vuePackage = join(root, 'packages', 'vue')
for (const entry of [
  'vue/dist/query-table.js',
  'query-table-core/dist/index.js',
  'query-protocol/dist/query-protocol.js'
]) {
  if (!existsSync(join(root, 'packages', entry))) {
    console.error(
      `[measure:consumer-size] packages/${entry} is missing: run \`pnpm build\` first`
    )
    process.exit(1)
  }
}
mkdirSync(outDir, { recursive: true })

const buildApp = async name => {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'warn',
    // The package name resolves through `exports` to dist/; its own
    // dependencies (core, protocol, TanStack) resolve from packages/vue.
    resolve: { alias: { '@dolusoft/query-table': vuePackage } },
    build: {
      write: false,
      minify: true,
      rolldownOptions: {
        input: join(root, 'fixtures', 'consumer', `${name}.ts`)
      }
    }
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    entry => entry.output
  )
  const chunks = outputs.filter(file => file.type === 'chunk')
  const code = chunks.map(chunk => chunk.code).join('\n')
  // Where the bytes come from: rendered size per package, before minifying.
  const sources = {}
  for (const chunk of chunks) {
    for (const [id, module] of Object.entries(chunk.modules)) {
      const path = id.replaceAll('\\', '/')
      const workspace = /\/packages\/([^/]+)\/dist\//.exec(path)
      const dependency =
        /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\//.exec(
          path
        )
      const source = workspace
        ? `packages/${workspace[1]}`
        : (dependency?.[1] ?? 'fixture')
      sources[source] = (sources[source] ?? 0) + module.renderedLength
    }
  }
  return {
    bytes: Buffer.byteLength(code),
    gzipBytes: gzipSync(code).length,
    brotliBytes: brotliCompressSync(code).length,
    renderedBySource: sources
  }
}

const names = ['composable', 'component']
const baseline = await buildApp('vue-only')
const apps = {}
const costs = {}
for (const name of names) {
  const app = await buildApp(name)
  apps[name] = app
  costs[name] = {
    bytes: app.bytes - baseline.bytes,
    gzipBytes: app.gzipBytes - baseline.gzipBytes,
    brotliBytes: app.brotliBytes - baseline.brotliBytes
  }
}

const version = name =>
  JSON.parse(
    readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')
  ).version

const file = join(outDir, 'consumer-size.json')
writeFileSync(
  file,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      versions: {
        package: JSON.parse(
          readFileSync(join(vuePackage, 'package.json'), 'utf8')
        ).version,
        vue: version('vue'),
        vite: version('vite')
      },
      note: 'minified app builds (Vue and TanStack bundled); each cost is the fixture minus vue-only',
      vueOnly: baseline,
      apps,
      costs
    },
    null,
    2
  )}\n`
)

console.log(`[measure:consumer-size] ${file}`)
console.log('                  bytes     gzip   brotli')
for (const [label, entry] of [
  ['vue only', baseline],
  ...Object.entries(costs)
]) {
  console.log(
    `${label.padEnd(15)} ${String(entry.bytes).padStart(8)} ${String(entry.gzipBytes).padStart(8)} ${String(entry.brotliBytes).padStart(8)}`
  )
}

if (process.argv.includes('--check')) {
  const budget = JSON.parse(
    readFileSync(join(root, 'scripts', 'consumer-size-budget.json'), 'utf8')
  )
  let failed = false
  for (const name of names) {
    const entry = budget.fixtures?.[name]
    if (typeof entry?.maxGzipBytes !== 'number') {
      console.error(
        `[measure:consumer-size] scripts/consumer-size-budget.json has no numeric \`maxGzipBytes\` for ${name}.`
      )
      failed = true
      continue
    }
    if (
      typeof entry.ceilingGzipBytes === 'number' &&
      entry.maxGzipBytes > entry.ceilingGzipBytes
    ) {
      console.error(
        `[measure:consumer-size] the ${name} budget ${entry.maxGzipBytes} B is over its ceiling of ${entry.ceilingGzipBytes} B: raise both only for a deliberate growth, with its reason in the history (P8).`
      )
      failed = true
    }
    const cost = costs[name].gzipBytes
    if (cost > entry.maxGzipBytes) {
      console.error(
        `[measure:consumer-size] ${name} costs ${cost} B gzip, over its budget of ${entry.maxGzipBytes} B (measured ${entry.measuredGzipBytes} B when it was set). Shrink the build, or raise scripts/consumer-size-budget.json on purpose.`
      )
      failed = true
    } else {
      console.log(
        `[measure:consumer-size] ${name} within budget: ${cost} B gzip of ${entry.maxGzipBytes} B`
      )
    }
  }
  if (failed) {
    process.exit(1)
  }
}
