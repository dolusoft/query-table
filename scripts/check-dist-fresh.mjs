// `check:package` and `api:check` read the `dist/` of every package, they do
// not build it. Fails when a package's main entry is missing or older than a
// file in its `src/` (specs never reach `dist`, so they do not count), when
// the copied conformance suite is older than a file of the suite, and when a
// copy of the reference skin is older than packages/vue/styles/table.css.
//
//   node scripts/check-dist-fresh.mjs   (after `pnpm build`)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(item =>
    item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]
  )

const problems = []
const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => join('packages', entry.name))

for (const dir of packages) {
  const manifest = JSON.parse(
    readFileSync(join(root, dir, 'package.json'), 'utf8')
  )
  // The skin package has no `main`: its one export is its stylesheet, a
  // copy of the Vue package's (checked below), and it has no src/.
  const entry = join(dir, manifest.main ?? Object.values(manifest.exports)[0])
  let built
  try {
    built = statSync(join(root, entry)).mtimeMs
  } catch {
    problems.push(`${entry} is missing`)
    continue
  }
  const src = join(root, dir, 'src')
  const newer = (existsSync(src) ? walk(src) : []).filter(
    file => !/\.spec\.ts$/.test(file) && statSync(file).mtimeMs > built
  )
  if (newer.length > 0) {
    problems.push(
      `${entry} is older than ${newer.length} file(s) in ${dir}/src (${newer
        .slice(0, 3)
        .map(file => file.slice(root.length + 1))
        .join(', ')})`
    )
  }
}

// The protocol package ships its conformance suite (C-79); the build copies
// it into dist/conformance last, after the manifest.
const suite = join(root, 'packages', 'query-protocol', 'conformance')
const copied = join(root, 'packages', 'query-protocol', 'dist', 'conformance')
let copiedAt
try {
  copiedAt = statSync(join(copied, 'manifest.json')).mtimeMs
} catch {
  problems.push(
    'packages/query-protocol/dist/conformance/manifest.json is missing'
  )
}
if (copiedAt !== undefined) {
  const stale = walk(suite).filter(file => statSync(file).mtimeMs > copiedAt)
  if (stale.length > 0) {
    problems.push(
      `packages/query-protocol/dist/conformance is older than ${stale.length} file(s) of the suite (${stale
        .slice(0, 3)
        .map(file => file.slice(root.length + 1))
        .join(', ')})`
    )
  }
}

// The reference skin (ADR 0025): the Vue package's build copies
// styles/table.css into its dist/, and so does the build of the skin
// package, published one last time in 3.23.0 with the same file.
const stylesheet = join(root, 'packages', 'vue', 'styles', 'table.css')
const copiers = ['packages/vue', 'packages/query-table-skin'].filter(path =>
  existsSync(join(root, path))
)
for (const dir of copiers) {
  const copy = join(dir, 'dist', 'table.css')
  let copiedOn
  try {
    copiedOn = statSync(join(root, copy)).mtimeMs
  } catch {
    problems.push(`${copy} is missing`)
    continue
  }
  if (statSync(stylesheet).mtimeMs > copiedOn) {
    problems.push(`${copy} is older than packages/vue/styles/table.css`)
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`check-dist-fresh: ${problem}`)
  }
  console.error('check-dist-fresh: run pnpm build first.')
  process.exit(1)
}
