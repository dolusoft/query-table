import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { Dataset, LocalQueryError } from '../src/local'
import { applyQuery, defineDataset } from '../src/local'
import type { Query } from '../src/protocol/types'

// Runs every active run of the conformance suite with applyQuery (C-79 adds
// the manifest, the schemas and the hashes). Runs the evaluator cannot pass
// before PR-L2 are listed here and reported as todo; L2 empties the list.
// The list is computed by the independent oracle of the suite: a run is
// pending when it needs a rule or an active search to reach its expectation.
const PENDING_L2: ReadonlySet<string> = new Set([
  'C49.2',
  'C12.1',
  'C12.2',
  'C12.3',
  'C13.1',
  'C13.2',
  'C13.3',
  'C14.1',
  'C37.3',
  'C37.4',
  'C39.1',
  'C39.2',
  'C40.1',
  'C40.2',
  'C40.3',
  'C63.1',
  'C15.1',
  'C15.2',
  'C16.1',
  'C17.1',
  'C18.1',
  'C19.1',
  'C20.1',
  'C23.1',
  'C23.2',
  'C30.1',
  'C30.2',
  'C33.1',
  'C34.1',
  'C41.1',
  'C41.2',
  'C59.1',
  'C59.2',
  'C59.3',
  'C59.4',
  'C59.5',
  'C59.6',
  'C59.7',
  'C59.8',
  'C59.9',
  'C59.10',
  'C59.11',
  'C59.12',
  'C60.1',
  'C60.2',
  'C60.3',
  'C60.4',
  'C60.5',
  'C60.6',
  'C60.7',
  'C60.8',
  'C60.9',
  'C61.1',
  'C61.2',
  'C61.3',
  'C61.4',
  'C62.1',
  'C62.2',
  'C24.1',
  'C24.2',
  'C25.1',
  'C26.1',
  'C26.2',
  'C27.3',
  'C42.1',
  'C42.2',
  'C42.3',
  'C42.4',
  'C52.1',
  'C52.2',
  'C52.3',
  'C52.4',
  'C52.5',
  'C52.6',
  'C52.7',
  'C52.8',
  'C52.9',
  'C52.10',
  'C52.11',
  'C52.12',
  'C52.13',
  'C52.14',
  'C52.15',
  'C52.16',
  'C21.1',
  'C22.1',
  'C51.1',
  'C51.2',
  'C51.3',
  'C53.2',
  'C53.3',
  'C53.4',
  'C29.3',
  'C50.2',
  'C55.1',
  'C55.6',
  'C66.1',
  'C66.2',
  'C66.3',
  'C66.5',
  'C66.6',
  'C66.7',
  'C66.8'
])

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

const suite = join(import.meta.dirname, '../conformance')
const caseDir = join(suite, 'cases')
const caseFiles = readdirSync(caseDir)
  .filter(name => name.endsWith('.json'))
  .sort()

const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(file, 'utf8')) as T

/** The data of a run: a reference relative to its case file, or inline. */
const loadData = (file: string, data: DataRef | undefined): Data => {
  if (data && 'ref' in data && typeof data.ref === 'string') {
    return readJson<Data>(resolve(dirname(file), data.ref))
  }
  if (data && 'inline' in data && typeof data.inline === 'object') {
    return structuredClone(data.inline)
  }
  throw new Error(`${file}: broken data reference`)
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

const runIds = new Set<string>()

for (const name of caseFiles) {
  const file = join(caseDir, name)
  const doc = readJson<CaseFile>(file)

  describe(name, () => {
    it('is fixture format 1', () => {
      expect(doc.fixtureFormat).toBe(1)
    })

    for (const kase of doc.fixtureFormat === 1 ? doc.cases : []) {
      if (kase.withdrawn) {
        continue
      }
      for (const run of kase.runs) {
        runIds.add(run.id)
        const title = `${run.id} ${kase.title}`
        if (PENDING_L2.has(run.id)) {
          it.todo(title)
          continue
        }
        it(title, () => {
          const { dataset, rows } = loadData(file, run.data ?? kase.data)
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

describe('the pending list', () => {
  it('names only runs of the suite', () => {
    expect([...PENDING_L2].filter(id => !runIds.has(id))).toEqual([])
  })
})
