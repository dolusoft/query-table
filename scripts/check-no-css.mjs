// The scripts of the table packages carry no styles (P5, ADR 0025). Fails
// when the build output or the tarball of a table package contains a
// stylesheet, with one exception: the reference skin, `table.css` of the Vue
// package (`@dolusoft/query-table/table.css`). That file must be in the Vue
// package's dist/ and tarball, and byte for byte its source,
// packages/vue/styles/table.css, so it does not come out of the script
// build.
//
// No module imports the stylesheet: fails when a `.js` of a dist/ or a
// `.d.ts` of a dist/types/ names a stylesheet specifier (`import
// './table.css'`, `import('x.css')`, `require('x.css')`).
//
// The skin package (packages/query-table-skin, ADR 0023) is published one
// last time in 3.23.0 with the same file (ADR 0025): its dist/ holds
// `table.css` alone, the same bytes, and its tarball exactly that, its
// README, the license and its manifest. No JavaScript.
//
// The tarballs are listed by `pnpm pack --dry-run`, the tool the release
// packs with (it adds the root LICENSE.md, which `npm pack` would not).
//
//   node scripts/check-no-css.mjs   (after `pnpm build`)
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const isStyle = path => /\.(css|scss|sass|less|styl)$/i.test(path)

/** The module specifiers in `code` that name a stylesheet, a query or hash after it included. */
export const styleSpecifiersIn = code =>
  [
    ...code.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g
    )
  ]
    .map(([, specifier]) => specifier)
    .filter(specifier => isStyle(specifier.replace(/[?#].*$/, '')))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(import.meta.dirname, '..')
  const rel = path => relative(root, path).split(sep).join('/')

  /** The package that ships the reference skin, and its one stylesheet. */
  const vuePackage = 'vue'
  const stylesheet = 'dist/table.css'
  const source = readFileSync(
    join(root, 'packages', vuePackage, 'styles', 'table.css')
  )
  /** The skin package, published one last time in 3.23.0 (ADR 0025). */
  const skinPackage = 'query-table-skin'

  const walk = dir =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory()
        ? walk(join(dir, entry.name))
        : [join(dir, entry.name)]
    )

  /** What `pnpm pack` puts in the tarball: `{ name, files: [{ path }] }`. */
  const tarballOf = dir =>
    JSON.parse(
      execSync('pnpm pack --dry-run --json', { cwd: dir, encoding: 'utf8' })
    )

  const found = []
  let checked = 0
  const sameAsSource = (file, owner) => {
    if (!existsSync(file)) {
      found.push(`${owner} has no ${rel(file)}`)
    } else if (!readFileSync(file).equals(source)) {
      found.push(
        `${rel(file)} is not byte for byte packages/vue/styles/table.css: rebuild`
      )
    }
  }

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
      } else {
        sameAsSource(join(dist, 'table.css'), packed.name)
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

    const allowed = name === vuePackage ? stylesheet : null
    for (const file of distFiles) {
      const path = relative(dir, file).split(sep).join('/')
      if (isStyle(file) && path !== allowed) {
        found.push(`dist: ${rel(file)}`)
      }
      const types = /^dist\/types\/.+\.d\.ts$/.test(path)
      if (/\.js$/.test(path) || types) {
        for (const specifier of styleSpecifiersIn(readFileSync(file, 'utf8'))) {
          found.push(`${rel(file)} imports ${specifier}`)
        }
      }
    }
    for (const file of packed.files) {
      if (isStyle(file.path) && file.path !== allowed) {
        found.push(`tarball of ${packed.name}: ${file.path}`)
      }
    }
    if (allowed) {
      sameAsSource(join(dir, allowed), packed.name)
      if (!packed.files.some(file => file.path === allowed)) {
        found.push(`tarball of ${packed.name} has no ${allowed}`)
      }
    }
  }

  if (found.length > 0) {
    console.error(
      `The table packages may ship one stylesheet, the Vue package's table.css, imported by no module, but:\n  ${found.join('\n  ')}`
    )
    process.exit(1)
  }
  console.log(
    `one stylesheet in the table packages, table.css of the Vue package, as written and imported by no module; the skin package holds the same file alone (${packages.length} packages, ${checked} files checked)`
  )
}
