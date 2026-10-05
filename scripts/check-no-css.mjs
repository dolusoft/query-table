// The table ships no CSS (contract rule C-31). Fails when the build output or
// the package tarball contains a stylesheet.
//
//   node scripts/check-no-css.mjs   (after `pnpm build`)
import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const isStyle = path => /\.(css|scss|sass|less|styl)$/i.test(path)

const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  )

const found = []

for (const file of walk(join(root, 'dist'))) {
  if (isStyle(file)) {
    found.push(`dist: ${file.slice(root.length)}`)
  }
}

// `npm pack --dry-run` lists what a tarball would hold without writing it.
// npm 10 prints an array, npm 11 an object keyed by package name.
const output = JSON.parse(
  execSync('npm pack --dry-run --json --ignore-scripts', {
    cwd: root,
    encoding: 'utf8'
  })
)
const packed = Array.isArray(output) ? output[0] : Object.values(output)[0]
for (const file of packed.files) {
  if (isStyle(file.path)) {
    found.push(`tarball: ${file.path}`)
  }
}

if (found.length > 0) {
  console.error(
    `The package must ship no CSS, but contains:\n  ${found.join('\n  ')}`
  )
  process.exit(1)
}
console.log(
  `no CSS in dist or in the tarball (${packed.files.length} files checked)`
)
