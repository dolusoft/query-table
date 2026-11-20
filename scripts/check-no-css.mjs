// The table packages ship no CSS (contract rule C-31, P5). Fails when the
// build output or the tarball of a table package contains a stylesheet.
//
// The reference skin (packages/query-table-skin, ADR 0023) is held to the
// opposite: its dist/ holds `table.css` and nothing else, and its tarball
// holds exactly that, its README, the license and its manifest. No
// JavaScript, so importing the skin can run no code.
//
// The tarballs are listed by `pnpm pack --dry-run`, the tool the release
// packs with (it adds the root LICENSE.md, which `npm pack` would not).
//
//   node scripts/check-no-css.mjs   (after `pnpm build`)
import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = join(import.meta.dirname, '..')
const isStyle = path => /\.(css|scss|sass|less|styl)$/i.test(path)

/** The one package of CSS alone (ADR 0023). */
const skinPackage = 'query-table-skin'

const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  )

/** What `pnpm pack` puts in the tarball: `{ name, files: [{ path }] }`. */
const tarballOf = dir =>
  JSON.parse(
    execSync('pnpm pack --dry-run --json', { cwd: dir, encoding: 'utf8' })
  )

const found = []
let checked = 0
const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)

for (const name of packages) {
  const dir = join(root, 'packages', name)
  const dist = join(dir, 'dist')
  const distFiles = existsSync(dist) ? walk(dist) : []
  const packed = tarballOf(dir)
  checked += distFiles.length + packed.files.length

  if (name === skinPackage) {
    const built = distFiles.map(file =>
      relative(dist, file).split(sep).join('/')
    )
    if (built.join() !== 'table.css') {
      found.push(
        `dist of the skin holds ${built.join(', ') || 'nothing'}, not table.css alone`
      )
    }
    const expected = [
      'LICENSE.md',
      'README.md',
      'dist/table.css',
      'package.json'
    ]
    const paths = packed.files.map(file => file.path)
    for (const path of paths) {
      if (!expected.includes(path)) {
        found.push(`tarball of ${packed.name} holds ${path}`)
      }
    }
    for (const path of expected) {
      if (!paths.includes(path)) {
        found.push(`tarball of ${packed.name} has no ${path}`)
      }
    }
    continue
  }

  for (const file of distFiles) {
    if (isStyle(file)) {
      found.push(`dist: ${file.slice(root.length + 1)}`)
    }
  }
  for (const file of packed.files) {
    if (isStyle(file.path)) {
      found.push(`tarball of ${packed.name}: ${file.path}`)
    }
  }
}

if (found.length > 0) {
  console.error(
    `The table packages must ship no CSS, and the skin only its stylesheet, but:\n  ${found.join('\n  ')}`
  )
  process.exit(1)
}
console.log(
  `no CSS in the table packages, only table.css in the skin (${packages.length} packages, ${checked} files checked)`
)
