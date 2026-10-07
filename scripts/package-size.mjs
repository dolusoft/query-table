// `pnpm measure:package-size`: how much an application that imports a v3
// package ships (P8). Builds each fixture of fixtures/packages into a
// minified app (TanStack bundled) against the built `dist/` of the packages,
// through their `exports` maps, and subtracts the empty baseline app. Writes
// node_modules/.cache/measure/package-size.json. Run after
// `pnpm build`.
//
// `--check` (CI) compares each gzip cost with scripts/package-size-budget.json
// and exits 1 when one is over its budget or a budget is over the ceiling
// of its fixture. Ceilings guard against silent drift (P8); a deliberate
// growth raises budget and ceiling in the same change, with its reason.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { buildFixture } from './fixture-build.mjs'

const root = join(import.meta.dirname, '..')

const buildApp = async name => {
  const code = (await buildFixture(name)).map(chunk => chunk.code).join('\n')
  return {
    bytes: Buffer.byteLength(code),
    gzipBytes: gzipSync(code).length,
    brotliBytes: brotliCompressSync(code).length
  }
}

const names = [
  'protocol',
  'protocol-local',
  'server-query',
  'filter-input',
  'core'
]
const empty = await buildApp('empty')
const costs = {}
for (const name of [...names, 'tanstack']) {
  const app = await buildApp(name)
  costs[name] = {
    bytes: app.bytes - empty.bytes,
    gzipBytes: app.gzipBytes - empty.gzipBytes,
    brotliBytes: app.brotliBytes - empty.brotliBytes
  }
}

// The plugins' and the protocol's share of the core fixture.
costs['core - tanstack'] = Object.fromEntries(
  Object.keys(costs.core).map(key => [
    key,
    costs.core[key] - costs.tanstack[key]
  ])
)

const outDir = join(root, 'node_modules', '.cache', 'measure')
mkdirSync(outDir, { recursive: true })
const file = join(outDir, 'package-size.json')
writeFileSync(
  file,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: 'minified app builds (TanStack bundled); each cost is the fixture minus fixtures/packages/empty.ts',
      empty,
      costs
    },
    null,
    2
  )}\n`
)

console.log(`[package-size] ${file}`)
console.log('                 bytes     gzip   brotli')
for (const [name, cost] of Object.entries(costs)) {
  console.log(
    `${name.padEnd(14)} ${String(cost.bytes).padStart(8)} ${String(cost.gzipBytes).padStart(8)} ${String(cost.brotliBytes).padStart(8)}`
  )
}

if (process.argv.includes('--check')) {
  const budget = JSON.parse(
    readFileSync(join(root, 'scripts', 'package-size-budget.json'), 'utf8')
  )
  let failed = false
  for (const name of names) {
    const entry = budget.fixtures?.[name]
    if (typeof entry?.maxGzipBytes !== 'number') {
      console.error(
        `[package-size] scripts/package-size-budget.json has no numeric \`maxGzipBytes\` for ${name}.`
      )
      failed = true
      continue
    }
    if (
      typeof entry.ceilingGzipBytes === 'number' &&
      entry.maxGzipBytes > entry.ceilingGzipBytes
    ) {
      console.error(
        `[package-size] the ${name} budget ${entry.maxGzipBytes} B is over its ceiling of ${entry.ceilingGzipBytes} B: raise both only for a deliberate growth, with its reason in the history (P8).`
      )
      failed = true
    }
    const cost = costs[name].gzipBytes
    if (cost > entry.maxGzipBytes) {
      console.error(
        `[package-size] ${name} costs ${cost} B gzip, over its budget of ${entry.maxGzipBytes} B (measured ${entry.measuredGzipBytes} B when it was set). Shrink the build, or raise scripts/package-size-budget.json on purpose.`
      )
      failed = true
    } else {
      console.log(
        `[package-size] ${name} within budget: ${cost} B gzip of ${entry.maxGzipBytes} B`
      )
    }
  }
  if (failed) {
    process.exit(1)
  }
}
