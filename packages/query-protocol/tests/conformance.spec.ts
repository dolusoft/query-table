import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'

import type { Dataset, LocalQueryError } from '../src/local'
import { applyQuery, defineDataset } from '../src/local'
import { columnTypes, filterConditions } from '../src/protocol/constants'
import type { Query } from '../src/protocol/types'

// The runner of the conformance suite (C-79). It reads the manifest, checks
// it and every case file against the published schemas, checks every hash
// and count, and runs every active run with applyQuery.

type Row = Record<string, unknown>
interface Data {
  dataset: Dataset<Row>
  rows: Row[]
}
type DataRef = { ref: string } | { inline: Data }
interface Run {
  id: string
  data?: DataRef
  query: unknown
  options?: { profile?: string; paginate?: boolean }
  expect:
    | { keys: unknown[]; totalRows: number }
    | { error: Omit<LocalQueryError, 'message'> }
}
interface Case {
  id: string
  title: string
  profile: string
  data: DataRef
  runs: Run[]
  withdrawn?: { reason: string; replacedBy?: string }
}
interface CaseFile {
  fixtureFormat: number
  cases: Case[]
}
interface Hashed {
  path: string
  sha256: string
}
interface Manifest {
  fixtureFormat: number
  suite: string
  revision: number
  profiles: string[]
  querySchema: Hashed
  files: (Hashed & { active: number; withdrawn: number; executions: number })[]
  data: Hashed[]
}
interface Suite {
  manifest: Manifest
  files: { path: string; doc: CaseFile }[]
  /** The data of a run: a reference relative to its case file, or inline. */
  data: (file: string, ref: DataRef) => Data
}

/** Reads a file of the suite by its path relative to the manifest. */
type Read = (path: string) => Buffer

const suiteDir = join(import.meta.dirname, '../conformance')
const readSuite: Read = path => readFileSync(join(suiteDir, path))

const sha256 = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex')
const parse = <T>(bytes: Buffer): T => JSON.parse(bytes.toString('utf8')) as T

const ajv = new Ajv2020({ allErrors: true })
const caseFileSchema = parse<{ $id: string }>(
  readSuite('schema/case-file.schema.json')
)
ajv.addSchema(caseFileSchema)
const validateManifest = ajv.compile<Manifest>(
  parse(readSuite('schema/manifest.schema.json'))
)
const validateCaseFile = ajv.getSchema<CaseFile>(caseFileSchema.$id)!
const validateData = ajv.getSchema<Data>(`${caseFileSchema.$id}#/$defs/Data`)!

// The schemas have no async keywords, so a validation result is a boolean.
const check = (valid: unknown, errors: unknown, what: string): void => {
  if (valid !== true) {
    throw new Error(
      `${what} does not fit its schema: ${JSON.stringify(errors)}`
    )
  }
}
const checkFormat = (format: unknown, what: string): void => {
  if (format !== 1) {
    throw new Error(`${what}: unknown fixtureFormat ${String(format)}`)
  }
}
const checkHash = (bytes: Buffer, entry: Hashed): void => {
  if (sha256(bytes) !== entry.sha256) {
    throw new Error(`${entry.path}: the SHA-256 does not match the manifest`)
  }
}

/**
 * Loads the suite the way any runner must: refuses an unknown
 * fixtureFormat, a file that does not fit its schema, a hash or a count
 * that does not match, a repeated id and a broken reference.
 */
const loadSuite = (read: Read): Suite => {
  const manifest = parse<Manifest>(read('manifest.json'))
  checkFormat(manifest.fixtureFormat, 'manifest.json')
  check(validateManifest(manifest), validateManifest.errors, 'manifest.json')
  checkHash(read(manifest.querySchema.path), manifest.querySchema)
  const data = new Map<string, Data>()
  for (const entry of manifest.data) {
    const bytes = read(entry.path)
    checkHash(bytes, entry)
    const doc = parse<Data>(bytes)
    check(validateData(doc), validateData.errors, entry.path)
    data.set(entry.path, doc)
  }
  const ids = new Set<string>()
  const unique = (id: string, path: string): void => {
    if (ids.has(id)) {
      throw new Error(`${path}: the id ${id} is not unique`)
    }
    ids.add(id)
  }
  const files = manifest.files.map(entry => {
    const bytes = read(entry.path)
    checkHash(bytes, entry)
    const doc = parse<CaseFile>(bytes)
    checkFormat(doc.fixtureFormat, entry.path)
    check(validateCaseFile(doc), validateCaseFile.errors, entry.path)
    const active = doc.cases.filter(kase => !kase.withdrawn)
    const counts = {
      active: active.length,
      withdrawn: doc.cases.length - active.length,
      executions: active.reduce((sum, kase) => sum + kase.runs.length, 0)
    }
    const listed = {
      active: entry.active,
      withdrawn: entry.withdrawn,
      executions: entry.executions
    }
    if (JSON.stringify(counts) !== JSON.stringify(listed)) {
      throw new Error(`${entry.path}: the counts do not match the manifest`)
    }
    for (const kase of doc.cases) {
      unique(kase.id, entry.path)
      for (const run of kase.runs) {
        unique(run.id, entry.path)
      }
    }
    return { path: entry.path, doc }
  })
  const dataOf = (file: string, ref: DataRef): Data => {
    if ('inline' in ref) {
      return structuredClone(ref.inline)
    }
    const path = posix.normalize(posix.join(posix.dirname(file), ref.ref))
    const doc = data.get(path)
    if (!doc) {
      throw new Error(`${file}: broken reference ${ref.ref}`)
    }
    return structuredClone(doc)
  }
  // A reference is resolved before any run, so a broken one fails the load.
  for (const { path, doc } of files) {
    for (const kase of doc.cases) {
      dataOf(path, kase.data)
      for (const run of kase.runs) {
        if (run.data) {
          dataOf(path, run.data)
        }
      }
    }
  }
  return { manifest, files, data: dataOf }
}

/** The key of a row, read by the dotted path of `dataset.key`. */
const keyOf = (row: Row, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (value, step) =>
        value === null || value === undefined
          ? undefined
          : (value as Row)[step],
      row
    )

const suite = loadSuite(readSuite)
const runIds = new Set<string>()

for (const { path, doc } of suite.files) {
  describe(path, () => {
    for (const kase of doc.cases) {
      if (kase.withdrawn) {
        continue
      }
      for (const run of kase.runs) {
        runIds.add(run.id)
        const title = `${run.id} ${kase.title}`
        it(title, () => {
          const { dataset, rows } = suite.data(path, run.data ?? kase.data)
          // A partial `options` is merged field by field over the defaults.
          const result = applyQuery(
            rows,
            run.query as Query,
            defineDataset(dataset),
            {
              profile: (run.options?.profile ?? kase.profile) as 'tr-1',
              paginate: run.options?.paginate ?? true
            }
          )
          if ('error' in run.expect) {
            expect(result.ok).toBe(false)
            if (!result.ok) {
              const { message, ...error } = result.error
              expect(typeof message).toBe('string')
              expect(error).toStrictEqual(run.expect.error)
            }
          } else {
            expect(result.ok).toBe(true)
            if (result.ok) {
              expect(
                result.rows.map(row => keyOf(row, dataset.key))
              ).toStrictEqual(run.expect.keys)
              expect(result.totalRows).toBe(run.expect.totalRows)
            }
          }
        })
      }
    }
  })
}

describe('the cases', () => {
  // The table in semantics.md#condition-by-type: a row of conditions by a
  // column of types. Every single condition is tried on every single type:
  // an allowed pair by a run with that one rule that keeps some rows and
  // drops others, a refused pair by a run that expects unsupported-operator.
  const rows: readonly (readonly string[])[] = [
    ['Contains', 'NotContains', 'StartsWith', 'EndsWith'],
    ['Equal', 'NotEqual'],
    ['GreaterThan', 'GreaterThanOrEqual', 'LessThan', 'LessThanOrEqual']
  ]
  const columns: readonly (readonly string[])[] = [
    ['string'],
    ['number', 'integer'],
    ['bool'],
    ['date', 'datetime']
  ]
  const allowed = [
    [true, false, false, false],
    [true, true, true, true],
    [false, true, false, true]
  ]

  it('group every condition and every type of the protocol once', () => {
    expect(rows.flat().sort()).toEqual([...filterConditions].sort())
    expect(columns.flat().sort()).toEqual([...columnTypes].sort())
  })

  it('cover every condition x type pair of the matrix', () => {
    const accepted = new Set<string>()
    const refused = new Set<string>()
    const pair = (condition: string, type: string) => `${condition} ${type}`
    for (const { path, doc } of suite.files) {
      for (const kase of doc.cases) {
        if (kase.withdrawn) {
          continue
        }
        for (const run of kase.runs) {
          const query = run.query as {
            filters?: unknown
            search?: unknown
          } | null
          const filters = query?.filters
          if (!Array.isArray(filters)) {
            continue
          }
          const data = suite.data(path, run.data ?? kase.data)
          type Rule = { field: string; condition: string }
          const pairOf = (rule: Rule) =>
            pair(rule.condition, data.dataset.fields[rule.field].type)
          if ('keys' in run.expect) {
            const alone =
              filters.length === 1 &&
              (query?.search ?? null) === null &&
              run.options?.paginate !== false
            const { totalRows } = run.expect
            if (alone && totalRows > 0 && totalRows < data.rows.length) {
              accepted.add(pairOf((filters as Rule[])[0]))
            }
          } else if (run.expect.error.code === 'unsupported-operator') {
            refused.add(pairOf((filters as Rule[])[run.expect.error.rule!]))
          }
        }
      }
    }
    const want = (keep: boolean) =>
      rows.flatMap((row, r) =>
        row.flatMap(condition =>
          columns.flatMap((column, c) =>
            allowed[r][c] === keep
              ? column.map(type => pair(condition, type))
              : []
          )
        )
      )
    expect([...accepted].sort()).toEqual(want(true).sort())
    expect([...refused].sort()).toEqual(want(false).sort())
  })
})

describe('C-79 The conformance suite ships [own]', () => {
  /** The real suite with some files replaced, and their hashes updated. */
  const patched = (
    files: Record<string, unknown>,
    manifest: (m: Manifest) => void = () => undefined
  ): Read => {
    const bytes = new Map(
      Object.entries(files).map(([path, doc]) => [
        path,
        Buffer.from(`${JSON.stringify(doc, null, 2)}\n`)
      ])
    )
    const m = parse<Manifest>(readSuite('manifest.json'))
    for (const entry of [...m.files, ...m.data]) {
      const replaced = bytes.get(entry.path)
      if (replaced) {
        entry.sha256 = sha256(replaced)
      }
    }
    manifest(m)
    bytes.set('manifest.json', Buffer.from(JSON.stringify(m)))
    return path => bytes.get(path) ?? readSuite(path)
  }
  const paging = parse<CaseFile>(readSuite('cases/paging.json'))

  it('describes itself in a manifest that fits its schema', () => {
    const { manifest } = suite
    expect(validateManifest(manifest)).toBe(true)
    expect(manifest.fixtureFormat).toBe(1)
    expect(manifest.suite).toBe('query-local-conformance')
    expect(manifest.revision).toBe(1)
    expect(manifest.profiles).toEqual(['tr-1'])
    expect(manifest.files.length).toBeGreaterThan(0)
    for (const { doc } of suite.files) {
      expect(validateCaseFile(doc)).toBe(true)
    }
  })

  it('hashes the bytes of every file, the data and the query schema', () => {
    const { manifest } = suite
    for (const entry of [...manifest.files, ...manifest.data]) {
      expect(sha256(readSuite(entry.path)), entry.path).toBe(entry.sha256)
    }
    expect(manifest.querySchema.path).toBe('../query.schema.json')
    expect(sha256(readFileSync(join(suiteDir, '../query.schema.json')))).toBe(
      manifest.querySchema.sha256
    )
  })

  it('counts the cases and runs of every file', () => {
    const total = suite.manifest.files.reduce(
      (sum, entry) => sum + entry.executions,
      0
    )
    expect(runIds.size).toBe(total)
  })

  it('lists every case file, and the runner reads only the listed ones', () => {
    const onDisk = readdirSync(join(suiteDir, 'cases'))
      .filter(name => name.endsWith('.json'))
      .map(name => `cases/${name}`)
      .sort()
    expect(suite.manifest.files.map(entry => entry.path).sort()).toEqual(onDisk)
    expect(suite.files.map(file => file.path)).toEqual(
      suite.manifest.files.map(entry => entry.path)
    )
    const onDiskData = readdirSync(join(suiteDir, 'data'))
      .map(name => `data/${name}`)
      .sort()
    expect(suite.manifest.data.map(entry => entry.path).sort()).toEqual(
      onDiskData
    )
  })

  it('refuses an unknown fixtureFormat', () => {
    expect(() =>
      loadSuite(
        patched({ 'cases/paging.json': { ...paging, fixtureFormat: 2 } })
      )
    ).toThrow('cases/paging.json: unknown fixtureFormat 2')
    expect(() =>
      loadSuite(
        patched({}, m => {
          m.fixtureFormat = 2
        })
      )
    ).toThrow('manifest.json: unknown fixtureFormat 2')
  })

  it('refuses a broken reference, also to data the manifest does not hash', () => {
    const broken = structuredClone(paging)
    broken.cases[1].data = { ref: '../data/missing.json' }
    expect(() => loadSuite(patched({ 'cases/paging.json': broken }))).toThrow(
      'cases/paging.json: broken reference ../data/missing.json'
    )
    const run = structuredClone(paging)
    run.cases[1].runs[0].data = { ref: '../cases/sort.json' }
    expect(() => loadSuite(patched({ 'cases/paging.json': run }))).toThrow(
      'broken reference ../cases/sort.json'
    )
  })

  it('refuses a hash or a count that does not match', () => {
    const edited = structuredClone(paging)
    edited.cases[1].title = 'Edited'
    const read = patched({ 'cases/paging.json': edited })
    const stale: Read = path =>
      path === 'manifest.json' ? readSuite(path) : read(path)
    expect(() => loadSuite(stale)).toThrow(
      'cases/paging.json: the SHA-256 does not match the manifest'
    )
    expect(() =>
      loadSuite(
        patched({}, m => {
          m.files[0].executions += 1
        })
      )
    ).toThrow('the counts do not match the manifest')
  })

  it('refuses a file that does not fit its schema and a repeated id', () => {
    const extra = structuredClone(paging) as CaseFile & { note?: string }
    extra.note = 'not in the format'
    expect(() => loadSuite(patched({ 'cases/paging.json': extra }))).toThrow(
      'does not fit its schema'
    )
    const twice = structuredClone(paging)
    twice.cases[1].runs[0].id = twice.cases[0].runs[0].id
    expect(() => loadSuite(patched({ 'cases/paging.json': twice }))).toThrow(
      `the id ${paging.cases[0].runs[0].id} is not unique`
    )
  })

  it('names case and run ids in the published form', () => {
    for (const { doc } of suite.files) {
      for (const kase of doc.cases) {
        expect(kase.id).toMatch(/^C\d{2}b?$/)
        for (const run of kase.runs) {
          expect(run.id.startsWith(`${kase.id}.`)).toBe(true)
        }
      }
    }
  })
})
