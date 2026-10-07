import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

// The CSS leak scan (P5): no package ships styles in any form, not only as
// a `.css` file (`pnpm check:package`). Every file of each package's
// `dist/` and of its tarball is searched for the marks of a stylesheet
// written by script: a keyframes block, a style element and a rule
// inserted into a sheet. The look of a flash, a pin or anything else lives
// in the consumer's skin (ADR 0011). Run after `pnpm build`.

const root = join(import.meta.dirname, '..', '..')
const packagesDir = join(root, 'packages')

/** The marks of a stylesheet; the message names the one found. */
const marks: Array<[string, RegExp]> = [
  ['@keyframes', /@keyframes/i],
  ['<style', /<style[\s>]/i],
  ['insertRule', /\binsertRule\b/],
  ['adoptedStyleSheets', /\badoptedStyleSheets\b/]
]

/** The stylesheet marks in `text`. */
const leaksIn = (text: string): string[] =>
  marks.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  )

const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => join(packagesDir, entry.name))

const rel = (path: string) => relative(root, path).split(sep).join('/')

/** The files `npm pack` would put in the tarball of the package in `dir`. */
const tarballFiles = (dir: string): string[] => {
  const output = JSON.parse(
    execSync('npm pack --dry-run --json --ignore-scripts', {
      cwd: dir,
      encoding: 'utf8'
    })
  ) as unknown
  const packed = (
    Array.isArray(output) ? output[0] : Object.values(output as object)[0]
  ) as { files: Array<{ path: string }> }
  return packed.files.map(file => join(dir, file.path))
}

describe('CSS leak scan (P5)', () => {
  it.each([
    ['@keyframes qt-flash-row-a { from { color: red } }', ['@keyframes']],
    ['document.head.append("<style>a{}</style>")', ['<style']],
    ['sheet.insertRule("a{}")', ['insertRule']],
    ['document.adoptedStyleSheets = [s]', ['adoptedStyleSheets']],
    ['el.setAttribute("data-flash", "a"); "--qt-flash-elapsed"', []],
    ['const stylesheet = "keyframes"', []]
  ])('reads %s as %j', (text, found) => {
    expect(leaksIn(text)).toEqual(found)
  })

  it.each(packages.map(dir => [rel(dir), dir]))(
    '%s ships no stylesheet in dist/ or in its tarball',
    (_name, dir) => {
      const dist = join(dir, 'dist')
      expect(existsSync(dist), `${rel(dist)}: run pnpm build first`).toBe(true)
      const files = new Set([...walk(dist), ...tarballFiles(dir)])
      const leaks = [...files]
        .filter(file => !/\.(png|jpe?g|gif|webp|ico|woff2?)$/i.test(file))
        .flatMap(file =>
          leaksIn(readFileSync(file, 'utf8')).map(
            mark => `${rel(file)}: ${mark}`
          )
        )
      expect(leaks).toEqual([])
    },
    60_000
  )
})
