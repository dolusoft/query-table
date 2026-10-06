// Packs the built conformance suite as a release asset (C-79, ADR 0008):
// writes `conformance-<revision>.tgz` (the `conformance/` directory and the
// `query.schema.json` beside it, laid out as in `dist/` of
// @dolusoft/query-protocol, so the manifest's `../query.schema.json`
// resolves) and `release-notes.md`, which pins the suite by the SHA-256 of
// its manifest.
// A manifest cannot pin itself; the note of a release can, and a .NET runner
// checks the downloaded manifest against it.
//
//   node scripts/pack-conformance.mjs <outDir>   (after `pnpm build`)
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = join(import.meta.dirname, '..')
const dist = join(root, 'packages', 'query-protocol', 'dist')
const manifestFile = join(dist, 'conformance', 'manifest.json')

const outArg = process.argv[2]
if (!outArg) {
  console.error('usage: node scripts/pack-conformance.mjs <outDir>')
  process.exit(1)
}
if (!existsSync(manifestFile)) {
  console.error(
    `[conformance] ${manifestFile} is missing: run pnpm build first`
  )
  process.exit(1)
}

const out = resolve(outArg)
mkdirSync(out, { recursive: true })
const bytes = readFileSync(manifestFile)
const manifest = JSON.parse(bytes.toString('utf8'))
const sha256 = createHash('sha256').update(bytes).digest('hex')
const asset = `conformance-${String(manifest.revision)}.tgz`

// A relative archive path: GNU tar reads `C:` as a remote host.
const packed = spawnSync(
  'tar',
  [
    '-czf',
    relative(dist, join(out, asset)),
    'conformance',
    'query.schema.json'
  ],
  { cwd: dist, stdio: 'inherit' }
)
if (packed.status !== 0) {
  console.error(`[conformance] tar failed (${String(packed.status)})`)
  process.exit(1)
}

writeFileSync(
  join(out, 'release-notes.md'),
  [
    `Conformance suite \`${manifest.suite}\` revision ${String(manifest.revision)}, profiles ${manifest.profiles.map(name => `\`${name}\``).join(', ')}.`,
    `Manifest SHA-256: \`${sha256}\`.`,
    `Asset: \`${asset}\` (also inside \`@dolusoft/query-protocol\` at \`dist/conformance/\`).`,
    ''
  ].join('\n')
)
console.log(`[conformance] ${join(out, asset)}, manifest ${sha256}`)
