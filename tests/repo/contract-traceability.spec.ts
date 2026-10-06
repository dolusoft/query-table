import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  collectSuite,
  coveredIds,
  namedIds,
  ruleSources,
  sourcesOf,
  taggedIds
} from './test-names'

// The behavior rules live in contract/rules.md as `### C-nn Title`. Every rule
// needs a runnable test that stands under its ID (in its own title or in the
// title of the `describe` around it), and a test may only name IDs that exist.
// The specs are read as syntax trees (`test-names.ts`): a `describe` that holds
// no test, a `.skip` or a `.todo` covers nothing.
//
// v3 (ADR 0004): a rule may name where its behavior comes from, with a
// `Source: tanstack` / `Source: own` / `Source: tanstack, own` line under its
// heading, and a test may carry the matching `[tanstack]` or `[own]` tag. Both
// are optional until the core plugins land; `requireSource` turns the rule
// side into a requirement.
const requireSource = false

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const rulesText = readFileSync(join(root, 'contract', 'rules.md'), 'utf8')
const rules = [...rulesText.matchAll(/^### (C-\d+) (.+)$/gm)].map(match => ({
  id: match[1],
  title: match[2]
}))
const sources = sourcesOf(rulesText)

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

/** `dir/*` that are directories, or nothing when `dir` does not exist. */
const childDirs = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .map(entry => join(dir, entry))
        .filter(path => statSync(path).isDirectory())
    : []

// Internal unit specs sit next to the code in src/; the behavior specs in
// tests/contract, the repository checks in tests/repo; the skin and
// playground specs in playground/. In the v3 workspace each package has its
// own src/ and tests/, and apps/ holds the playground.
const roots = [
  join(root, 'tests'),
  ...childDirs(join(root, 'packages')).flatMap(pkg => [
    join(pkg, 'src'),
    join(pkg, 'tests')
  ]),
  ...childDirs(join(root, 'apps'))
].filter(dir => existsSync(dir))

const suites = roots.flatMap(specFiles).map(file => ({
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

  it('names only known sources on the Source lines of the rules', () => {
    const known = new Set<string>(ruleSources)
    const wrong = [...sources].flatMap(([id, names]) =>
      names.filter(name => !known.has(name)).map(name => `${id} ${name}`)
    )
    expect(wrong).toEqual([])
  })

  it('names the source of every rule once required', () => {
    const missing = rules
      .filter(rule => !sources.has(rule.id))
      .map(rule => rule.id)
    expect(requireSource ? missing : []).toEqual([])
  })

  it('tags a test only with a source of the rule it stands under', () => {
    const known = new Set<string>(ruleSources)
    const wrong = suites.flatMap(({ file, suite }) =>
      taggedIds(suite)
        .filter(
          ({ id, tag }) =>
            !known.has(tag) ||
            (sources.has(id) && !sources.get(id)!.includes(tag))
        )
        .map(({ id, tag }) => `${file}: ${id} [${tag}]`)
    )
    expect(wrong).toEqual([])
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

  it('reads the Source line under a rule heading', () => {
    const text = [
      '### C-01 One',
      '',
      'Body.',
      '',
      'Source: tanstack, own',
      '',
      '### C-02 Two',
      '',
      'Body.',
      '### C-03 Three',
      'Source: Own'
    ].join('\n')
    expect([...sourcesOf(text)]).toEqual([
      ['C-01', ['tanstack', 'own']],
      ['C-03', ['own']]
    ])
  })

  it('pairs the tags of a test with the rule IDs it stands under', () => {
    expect(
      taggedIds(
        collectSuite(
          `describe('C-05 paging [tanstack]', () => { it('x [own]', () => {}) })`
        )
      )
    ).toEqual([
      { id: 'C-05', tag: 'tanstack' },
      { id: 'C-05', tag: 'own' }
    ])
    expect(taggedIds(collectSuite(`it.skip('C-05 [own]', () => {})`))).toEqual(
      []
    )
  })

  it('names the IDs of empty groups too, so an unknown one still fails', () => {
    expect(namedIds(collectSuite(`describe('C-99 empty', () => {})`))).toEqual([
      'C-99'
    ])
  })
})
