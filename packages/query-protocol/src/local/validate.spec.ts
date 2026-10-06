import { describe, expect, it } from 'vitest'

import { applyQuery } from './apply-query'
import type { Dataset } from './dataset'
import { defineDataset } from './dataset'
import { reservedQueryKeys } from './profiles'
import type { Query } from '../protocol/types'

type Row = Record<string, unknown>

const people = defineDataset<Row>({
  key: 'id',
  fields: {
    id: { type: 'integer' },
    name: { type: 'string', search: true },
    age: { type: 'integer' },
    seen: { type: 'datetime', offset: '+03:00' }
  }
})
const rows: Row[] = [
  { id: 1, name: 'Ali', age: 30, seen: '2026-10-06T00:30:00+03:00' },
  { id: 2, name: 'Cem', age: null, seen: null }
]
const q = (extra: object = {}): Query => ({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: [],
  ...extra
})
const run = (
  query: unknown,
  data: readonly Row[] = rows,
  dataset: Dataset<Row> = people
) => applyQuery(data, query as Query, dataset, { profile: 'tr-1' })
const errorOf = (result: ReturnType<typeof run>) => {
  if (result.ok) {
    throw new Error('expected an error')
  }
  const { message, ...error } = result.error
  expect(typeof message).toBe('string')
  return error
}

describe('C-77 Structural errors [own]', () => {
  it('throws TypeError when its preconditions are broken', () => {
    const plain = {
      key: 'id',
      fields: { id: { type: 'integer' } }
    } as Dataset<Row>
    expect(() => applyQuery(rows, q(), plain, { profile: 'tr-1' })).toThrow(
      TypeError
    )
    const call = (options: unknown) => () =>
      applyQuery(rows, q(), people, options as { profile: 'tr-1' })
    expect(call(null)).toThrow(TypeError)
    expect(call([])).toThrow(TypeError)
    expect(call('tr-1')).toThrow(TypeError)
    expect(call({ profile: 'tr-1', paginate: 'yes' })).toThrow(TypeError)
    expect(call({ profile: 'tr-1', paginate: undefined })).not.toThrow()
  })

  it('returns query errors without looking at the rows', () => {
    expect(
      errorOf(run(q({ sort: { field: 'x', direction: 'asc' } }), []))
    ).toEqual({
      code: 'unknown-field',
      field: 'x',
      path: '/sort/field'
    })
  })

  it('finds the first error in the order of the profile', () => {
    // A cursor, a bad page, a reserved key and a bad sort: the cursor wins.
    const all = q({ cursor: null, page: 0, any: [], sort: 1 })
    expect(errorOf(run(all)).code).toBe('cursor-not-supported')
    const rest = q({ page: 0, any: [], sort: 1 })
    expect(errorOf(run(rest))).toEqual({ code: 'invalid-page', path: '/page' })
  })

  it('rejects the reserved keys in their order, ignores other unknown keys', () => {
    expect([...reservedQueryKeys]).toEqual([
      'sorts',
      'any',
      'group',
      'aggregates'
    ])
    expect(errorOf(run(q({ aggregates: [], group: [] })))).toEqual({
      code: 'unsupported-extension',
      name: 'group',
      path: '/group'
    })
    const result = run(q({ columns: ['id'], range: {}, timeRange: 1 }))
    expect(result.ok && result.rows).toEqual(rows)
  })

  it('does not take an inherited property for a field', () => {
    expect(
      errorOf(run(q({ sort: { field: 'toString', direction: 'asc' } })))
    ).toEqual({ code: 'unknown-field', field: 'toString', path: '/sort/field' })
  })

  it('reports a getter that throws as invalid data', () => {
    const dataset = defineDataset<Row>({
      key: 'id',
      fields: {
        id: { type: 'integer' },
        v: {
          type: 'string',
          get: row => {
            if (row.id === 2) {
              throw new Error('boom')
            }
            return 'x'
          }
        }
      }
    })
    const result = run(
      q({ sort: { field: 'v', direction: 'asc' } }),
      rows,
      dataset
    )
    expect(errorOf(result)).toEqual({
      code: 'invalid-data',
      field: 'v',
      row: 1
    })
  })

  it('reports a getter that returns a Promise as invalid data', () => {
    const dataset = defineDataset<Row>({
      key: 'id',
      fields: {
        id: { type: 'integer' },
        v: { type: 'string', get: () => Promise.resolve('x') }
      }
    })
    const result = run(
      q({ sort: { field: 'v', direction: 'asc' } }),
      rows,
      dataset
    )
    expect(errorOf(result)).toEqual({
      code: 'invalid-data',
      field: 'v',
      row: 0
    })
  })

  it('calls get at most once per row and evaluation', () => {
    let reads = 0
    let keyReads = 0
    const dataset = defineDataset<Row>({
      key: 'id',
      fields: {
        id: {
          type: 'integer',
          get: row => {
            keyReads++
            return row.id
          }
        },
        age: {
          type: 'integer',
          get: row => {
            reads++
            return row.age
          }
        }
      }
    })
    run(q({ sort: { field: 'age', direction: 'desc' } }), rows, dataset)
    expect(reads).toBe(rows.length)
    expect(keyReads).toBe(rows.length)
    keyReads = 0
    run(q({ sort: { field: 'id', direction: 'asc' } }), rows, dataset)
    expect(keyReads).toBe(rows.length)
  })

  it('does not read fields the query does not use', () => {
    let reads = 0
    const dataset = defineDataset<Row>({
      key: 'id',
      fields: {
        id: { type: 'integer' },
        age: {
          type: 'integer',
          get: () => {
            reads++
            return 'not a number'
          }
        }
      }
    })
    expect(run(q(), rows, dataset).ok).toBe(true)
    expect(reads).toBe(0)
  })

  it('a Date object is invalid data', () => {
    const data = [{ id: 1, seen: new Date(0) }]
    expect(
      errorOf(run(q({ sort: { field: 'seen', direction: 'asc' } }), data))
    ).toEqual({ code: 'invalid-data', field: 'seen', row: 0 })
  })

  it('does not convert types', () => {
    const asText = [{ id: 1, age: '25' }]
    expect(
      errorOf(run(q({ sort: { field: 'age', direction: 'asc' } }), asText))
    ).toEqual({ code: 'invalid-data', field: 'age', row: 0 })
    const fraction = [{ id: 2.5 }]
    expect(errorOf(run(q(), fraction))).toEqual({
      code: 'invalid-data',
      field: 'id',
      row: 0
    })
  })

  it('reads a path through the prototype chain, as the table does', () => {
    // `{}.constructor` is the Object function: it does not fit `string`.
    const dataset = defineDataset<Row>({
      key: 'id',
      fields: {
        id: { type: 'integer' },
        constructor: { type: 'string' as const }
      }
    })
    const result = run(
      q({ sort: { field: 'constructor', direction: 'asc' } }),
      [{ id: 1 }],
      dataset
    )
    expect(errorOf(result)).toEqual({
      code: 'invalid-data',
      field: 'constructor',
      row: 0
    })
  })

  it('a row that is not an object has no key', () => {
    expect(errorOf(run(q(), [rows[0], 7 as unknown as Row]))).toEqual({
      code: 'invalid-data',
      field: 'id',
      row: 1
    })
  })

  it('a repeated key is an error even off the page', () => {
    const data = [...rows, { id: 1, name: 'Again' }]
    expect(errorOf(run(q({ pageSize: 1 }), data))).toEqual({
      code: 'duplicate-key',
      field: 'id',
      row: 2
    })
  })

  it('refuses IsNull and IsNotNull as extensions', () => {
    const rule = { field: 'age', condition: 'IsNotNull', value: 'x' }
    expect(errorOf(run(q({ filters: [rule] })))).toEqual({
      code: 'unsupported-extension',
      name: 'IsNotNull',
      field: 'age',
      rule: 0,
      path: '/filters/0/condition'
    })
  })
})

describe('PR-L1 refuses rules and search until PR-L2', () => {
  it('refuses the first rule after its structure and field are checked', () => {
    const rules = [
      { field: 'age', condition: 'Equal', value: 30 },
      { field: 'nope', condition: 'Bad', value: null }
    ]
    expect(errorOf(run(q({ filters: rules })))).toEqual({
      code: 'unsupported-operator',
      field: 'age',
      rule: 0,
      path: '/filters/0/condition'
    })
    const unknown = [{ field: 'nope', condition: 'Equal', value: 1 }]
    expect(errorOf(run(q({ filters: unknown })))).toEqual({
      code: 'unknown-field',
      field: 'nope',
      rule: 0,
      path: '/filters/0/field'
    })
  })

  it('refuses an active search, accepts an empty or blank one', () => {
    expect(errorOf(run(q({ search: ' ali ' })))).toEqual({
      code: 'search-not-supported',
      path: '/search'
    })
    expect(run(q({ search: ' \t\u00a0' })).ok).toBe(true)
    expect(run(q({ search: null })).ok).toBe(true)
    expect(errorOf(run(q({ search: '\ud800' })))).toEqual({
      code: 'invalid-value',
      path: '/search'
    })
  })
})
