// The last step of the protocol build: copies the conformance suite
// (packages/query-protocol/conformance) into dist/conformance, where the
// package exports it as `@dolusoft/query-protocol/conformance/*` (C-79). The
// manifest names the query schema as `../query.schema.json`, which the build
// copies to dist/ before this step. The old copy is removed first, so a file
// deleted from the suite does not stay in the package.
import { cpSync, existsSync, rmSync, utimesSync } from 'node:fs'
import { join } from 'node:path'

const pkg = join(import.meta.dirname, '..', 'packages', 'query-protocol')
const from = join(pkg, 'conformance')
const to = join(pkg, 'dist', 'conformance')

if (!existsSync(join(pkg, 'dist', 'query.schema.json'))) {
  console.error('[conformance] dist/query.schema.json is missing: build first')
  process.exit(1)
}
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })
// A copy may keep the source times (Windows does); check-dist-fresh compares
// the suite with the time of this copy, so the copied manifest records it.
const now = new Date()
utimesSync(join(to, 'manifest.json'), now, now)
console.log(`[conformance] ${from} -> ${to}`)
