import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// The behavior rules live in contract/rules.md as `### C-nn Title`. Every rule
// needs a test whose name contains its ID, and a test may only name IDs that
// exist. The tests are read as text: a name is a string literal that starts a
// `describe(`, `it(`, `test(` or `it.each(...)(` call.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const rules = [
  ...readFileSync(join(root, 'contract', 'rules.md'), 'utf8').matchAll(
    /^### (C-\d+) (.+)$/gm
  )
].map(match => ({ id: match[1], title: match[2] }))

const specFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      return ['node_modules', '__screenshots__', 'dist'].includes(entry)
        ? []
        : specFiles(path)
    }
    return /\.spec\.ts$/.test(entry) &&
      !entry.startsWith('contract-traceability')
      ? [path]
      : []
  })

const NAME =
  /\b(?:describe|it|test)(?:\.\w+)*(?:\([^)]*\))?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g

// Unit specs sit next to the code in src/, the browser and cross-cutting ones
// in tests/, the skin and playground specs in playground/.
const named = [
  ...specFiles(join(root, 'src')),
  ...specFiles(join(root, 'tests')),
  ...specFiles(join(root, 'playground'))
].flatMap(file => {
  const text = readFileSync(file, 'utf8')
  return [...text.matchAll(NAME)].map(match => ({
    file: file.slice(root.length + 1).replace(/\\/g, '/'),
    name: match[2]
  }))
})

describe('contract traceability', () => {
  it('finds the rules and the test names', () => {
    expect(rules.length).toBeGreaterThan(30)
    expect(named.length).toBeGreaterThan(100)
  })

  it('numbers the rules without gaps', () => {
    expect(rules.map(rule => rule.id)).toEqual(
      rules.map((_, index) => `C-${String(index + 1).padStart(2, '0')}`)
    )
  })

  it('has a test for every rule', () => {
    const missing = rules.filter(
      rule => !named.some(test => test.name.includes(rule.id))
    )
    expect(
      missing.map(rule => `${rule.id} ${rule.title}`),
      'rules without a test whose name contains the ID'
    ).toEqual([])
  })

  it('has no test that names an unknown rule', () => {
    const known = new Set(rules.map(rule => rule.id))
    const unknown = named.flatMap(test =>
      [...test.name.matchAll(/\bC-\d{2,}\b/g)]
        .map(match => match[0])
        .filter(id => !known.has(id))
        .map(id => `${test.file}: "${test.name}" names ${id}`)
    )
    expect(unknown).toEqual([])
  })
})
