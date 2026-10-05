// `pnpm measure:consumer-size`: how much an application that imports the
// package ships. Builds two minified apps from fixtures/consumer (with the
// table, and the same app without it), both against the built `dist/` through
// the package `exports`, and writes the difference to
// node_modules/.cache/measure/consumer-size.json. Run after `pnpm build`
// (the package script does). `--check` also compares the gzip package cost with
// scripts/consumer-size-budget.json and exits 1 when it is over.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { build } from 'vite'

const root = join(import.meta.dirname, '..')
const outDir = join(root, 'node_modules', '.cache', 'measure')
if (!existsSync(join(root, 'dist', 'vue-server-table.js'))) {
  console.error(
    '[measure:consumer-size] dist/ is missing: run `pnpm build` first'
  )
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const buildApp = async name => {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'warn',
    // Self-reference by package name resolves through `exports` to dist/.
    resolve: { alias: { '@dolusoft/vue-server-table': root } },
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
      const dependency =
        /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\//.exec(
          path
        )
      const source = path.includes('/dist/vue-server-table')
        ? '@dolusoft/vue-server-table'
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

const withTable = await buildApp('with-table')
const baseline = await buildApp('vue-only')
const version = name =>
  JSON.parse(
    readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')
  ).version

const result = {
  generatedAt: new Date().toISOString(),
  versions: {
    package: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
      .version,
    vue: version('vue'),
    vite: version('vite')
  },
  note: 'minified app builds (vue bundled); the package cost is with-table minus vue-only',
  withTable,
  vueOnly: baseline,
  packageCost: {
    bytes: withTable.bytes - baseline.bytes,
    gzipBytes: withTable.gzipBytes - baseline.gzipBytes,
    brotliBytes: withTable.brotliBytes - baseline.brotliBytes
  }
}
const file = join(outDir, 'consumer-size.json')
writeFileSync(file, JSON.stringify(result, null, 2) + '\n')

console.log(`[measure:consumer-size] ${file}`)
console.log('                  bytes     gzip   brotli')
for (const [label, entry] of [
  ['with the table', withTable],
  ['vue only', baseline],
  ['package cost', result.packageCost]
]) {
  console.log(
    `${label.padEnd(15)} ${String(entry.bytes).padStart(8)} ${String(entry.gzipBytes).padStart(8)} ${String(entry.brotliBytes).padStart(8)}`
  )
}

// `--check` (CI): fail when the package cost, minified + gzip, is over the
// budget in scripts/consumer-size-budget.json.
if (process.argv.includes('--check')) {
  const budget = JSON.parse(
    readFileSync(join(root, 'scripts', 'consumer-size-budget.json'), 'utf8')
  )
  const cost = result.packageCost.gzipBytes
  if (cost > budget.maxGzipBytes) {
    console.error(
      `[measure:consumer-size] package cost ${cost} B gzip is over the budget of ${budget.maxGzipBytes} B (measured ${budget.measuredGzipBytes} B when it was set). Shrink the build, or raise scripts/consumer-size-budget.json on purpose.`
    )
    process.exit(1)
  }
  console.log(
    `[measure:consumer-size] within budget: ${cost} B gzip of ${budget.maxGzipBytes} B`
  )
}
