import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { collectSuite, coveredIds, namedIds } from './test-names'

// The behavior rules live in contract/rules.md as `### C-nn Title`. Every rule
// needs a runnable test that stands under its ID (in its own title or in the
// title of the `describe` around it), and a test may only name IDs that exist.
// The specs are read as syntax trees (`test-names.ts`): a `describe` that holds
// no test, a `.skip` or a `.todo` covers nothing.

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

// Unit specs sit next to the code in src/, the browser and cross-cutting ones
// in tests/, the skin and playground specs in playground/.
const suites = [
  ...specFiles(join(root, 'src')),
  ...specFiles(join(root, 'tests')),
  ...specFiles(join(root, 'playground'))
].map(file => ({
  file: file.slice(root.length + 1).replace(/\\/g, '/'),
  suite: collectSuite(readFileSync(file, 'utf8'), file)
}))

const covered = new Set(suites.flatMap(({ suite }) => [...coveredIds(suite)]))

describe('contract traceability', () => {
  it('finds the rules and the tests', () => {
    expect(rules.length).toBeGreaterThan(30)
    expect(
      suites.reduce((n, { suite }) => n + suite.tests.length, 0)
    ).toBeGreaterThan(100)
  })

  it('numbers the rules without gaps', () => {
    expect(rules.map(rule => rule.id)).toEqual(
      rules.map((_, index) => `C-${String(index + 1).padStart(2, '0')}`)
    )
  })

  it('has a test for every rule', () => {
    const missing = rules.filter(rule => !covered.has(rule.id))
    expect(
      missing.map(rule => `${rule.id} ${rule.title}`),
      'rules without a runnable test that stands under the ID'
    ).toEqual([])
  })

  it('has no test that names an unknown rule', () => {
    const known = new Set(rules.map(rule => rule.id))
    const unknown = suites.flatMap(({ file, suite }) =>
      namedIds(suite)
        .filter(id => !known.has(id))
        .map(id => `${file} names ${id}`)
    )
    expect(unknown).toEqual([])
  })
})

describe('contract traceability reader', () => {
  const idsOf = (source: string) => coveredIds(collectSuite(source))

  it('counts the ID in a test title', () => {
    expect([...idsOf(`it('C-01 does a thing', () => {})`)]).toEqual(['C-01'])
    expect([...idsOf(`test('C-02 does a thing', () => {})`)]).toEqual(['C-02'])
  })

  it('counts the ID of a describe that holds a test', () => {
    expect([
      ...idsOf(`describe('C-03 group', () => { it('works', () => {}) })`)
    ]).toEqual(['C-03'])
    expect([
      ...idsOf(
        `describe('C-04 a', () => { describe('b', () => { it('x', () => {}) }) })`
      )
    ]).toEqual(['C-04'])
  })

  it('does not count an empty describe, a skipped test or a todo', () => {
    expect(idsOf(`describe('C-05 empty', () => {})`).size).toBe(0)
    expect(
      idsOf(`describe('C-06 nested empty', () => { describe('x', () => {}) })`)
        .size
    ).toBe(0)
    expect(idsOf(`it.skip('C-07 skipped', () => {})`).size).toBe(0)
    expect(idsOf(`it.todo('C-08 later')`).size).toBe(0)
    expect(
      idsOf(`describe.skip('C-09 g', () => { it.skip('x', () => {}) })`).size
    ).toBe(0)
  })

  it('reads .each and .only calls', () => {
    expect([...idsOf(`it.each([1, 2])('C-10 case %s', () => {})`)]).toEqual([
      'C-10'
    ])
    expect([...idsOf(`it.only('C-11 one', () => {})`)]).toEqual(['C-11'])
  })

  it('names the IDs of empty groups too, so an unknown one still fails', () => {
    expect(namedIds(collectSuite(`describe('C-99 empty', () => {})`))).toEqual([
      'C-99'
    ])
  })
})
