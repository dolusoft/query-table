import { describe, expect, it } from 'vitest'

import { applyQuery, slicePage } from './apply-query'
import type { Dataset } from './dataset'
import { defineDataset } from './dataset'
import type { LocalQueryError } from './errors'
import { profiles } from './profiles'
import type { Query } from '../protocol/types'

type Row = { id: number; name: string | null; score: number | null }

const definition: Dataset<Row> = {
  key: 'id',
  fields: {
    id: { type: 'integer' },
    name: { type: 'string' },
    score: { type: 'number' }
  }
}
const dataset = defineDataset(definition)
const rows: Row[] = [
  { id: 3, name: 'Cem', score: 2 },
  { id: 1, name: 'ali', score: null },
  { id: 2, name: 'Ali', score: 2 },
  { id: 4, name: null, score: -0 }
]
const q = (extra: object = {}): Query => ({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: [],
  ...extra
})
const ids = (result: ReturnType<typeof applyQuery<Row>>) =>
  result.ok ? result.rows.map(row => row.id) : result.error.code

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    const keys = Object.keys(value)
    for (let i = 0; i < keys.length; i++) {
      deepFreeze((value as Record<string, unknown>)[keys[i]])
    }
  }
  return value
}

describe('C-76 Pipeline, page mode and result [own]', () => {
  it('deep-frozen inputs are read, never written', () => {
    const frozenRows = deepFreeze(structuredClone(rows))
    const frozenQuery = deepFreeze(
      q({ sort: { field: 'score', direction: 'desc' }, pageSize: 2, page: 2 })
    )
    const frozenDefinition = deepFreeze(structuredClone(definition))
    const result = applyQuery(
      frozenRows,
      frozenQuery,
      defineDataset(frozenDefinition),
      deepFreeze({ profile: 'tr-1' as const })
    )
    expect(ids(result)).toEqual([4, 1])
  })

  it('never returns the input array', () => {
    for (const paginate of [true, false]) {
      for (const sort of [null, { field: 'id', direction: 'asc' }]) {
        const result = applyQuery(rows, q({ sort }), dataset, {
          profile: 'tr-1',
          paginate
        })
        expect(result.ok && result.rows).not.toBe(rows)
        expect(result.ok && result.rows.every(row => rows.includes(row))).toBe(
          true
        )
      }
    }
  })

  it('keeps the order of allRows when sort is null', () => {
    expect(ids(applyQuery(rows, q(), dataset, { profile: 'tr-1' }))).toEqual([
      3, 1, 2, 4
    ])
  })

  it('sorts with null first, -0 equal to 0, ties by key ascending both ways', () => {
    const asc = q({ sort: { field: 'score', direction: 'asc' } })
    expect(ids(applyQuery(rows, asc, dataset, { profile: 'tr-1' }))).toEqual([
      1, 4, 2, 3
    ])
    const desc = q({ sort: { field: 'score', direction: 'desc' } })
    expect(ids(applyQuery(rows, desc, dataset, { profile: 'tr-1' }))).toEqual([
      2, 3, 4, 1
    ])
    const byName = q({ sort: { field: 'name', direction: 'asc' } })
    expect(ids(applyQuery(rows, byName, dataset, { profile: 'tr-1' }))).toEqual(
      [4, 2, 1, 3]
    )
  })

  it('breaks ties of a string key by its raw ordinal order', () => {
    const keyed = defineDataset<{ k: string; v: number }>({
      key: 'k',
      fields: { k: { type: 'string' }, v: { type: 'integer' } }
    })
    const data = [
      { k: '2', v: 1 },
      { k: '\u00e9', v: 1 },
      { k: '10', v: 1 },
      { k: 'e\u0301', v: 1 },
      { k: '1', v: 1 }
    ]
    const result = applyQuery(
      data,
      q({ sort: { field: 'v', direction: 'desc' } }),
      keyed,
      { profile: 'tr-1' }
    )
    expect(result.ok && result.rows.map(row => row.k)).toEqual([
      '1',
      '10',
      '2',
      'e\u0301',
      '\u00e9'
    ])
  })

  it('counts independently of the page and does not correct the page', () => {
    const page = (n: number) =>
      applyQuery(rows, q({ page: n, pageSize: 3 }), dataset, {
        profile: 'tr-1'
      })
    expect(page(1)).toEqual({ ok: true, rows: rows.slice(0, 3), totalRows: 4 })
    expect(page(2)).toEqual({ ok: true, rows: rows.slice(3), totalRows: 4 })
    expect(page(9)).toEqual({ ok: true, rows: [], totalRows: 4 })
  })

  it('pages without overflow', () => {
    const max = Number.MAX_SAFE_INTEGER
    expect(
      applyQuery(rows, q({ page: max, pageSize: max }), dataset, {
        profile: 'tr-1'
      })
    ).toEqual({ ok: true, rows: [], totalRows: 4 })
    expect(
      applyQuery(rows, q({ page: 1, pageSize: max }), dataset, {
        profile: 'tr-1'
      })
    ).toEqual({ ok: true, rows, totalRows: 4 })
  })

  it('paginate false returns every row in order and still validates paging', () => {
    const options = { profile: 'tr-1', paginate: false } as const
    const sorted = q({
      page: 2,
      pageSize: 1,
      sort: { field: 'id', direction: 'asc' }
    })
    expect(ids(applyQuery(rows, sorted, dataset, options))).toEqual([
      1, 2, 3, 4
    ])
    expect(ids(applyQuery(rows, q({ page: 0 }), dataset, options))).toBe(
      'invalid-page'
    )
    expect(ids(applyQuery(rows, q({ pageSize: 1.5 }), dataset, options))).toBe(
      'invalid-page'
    )
    expect(ids(applyQuery(rows, q({ cursor: null }), dataset, options))).toBe(
      'cursor-not-supported'
    )
  })

  it('takes only safe integers of at least 1 as page and page size', () => {
    for (const page of [0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
      const result = applyQuery(rows, q({ page }), dataset, { profile: 'tr-1' })
      expect(result.ok ? null : result.error).toMatchObject({
        code: 'invalid-page',
        path: '/page'
      })
    }
  })

  it('slicePage validates the paging part the same way and slices', () => {
    expect(slicePage(rows, { page: 2, pageSize: 3 })).toEqual({
      ok: true,
      rows: rows.slice(3),
      totalRows: 4
    })
    expect(slicePage(rows, q({ page: 3, pageSize: 2 }))).toEqual({
      ok: true,
      rows: [],
      totalRows: 4
    })
    const bad = slicePage(rows, { page: 1, pageSize: 0 })
    expect(bad.ok ? null : bad.error).toMatchObject({
      code: 'invalid-page',
      path: '/pageSize'
    })
    const cursor = slicePage(rows, {
      ...q(),
      cursor: null
    })
    expect(cursor.ok ? null : cursor.error).toMatchObject({
      code: 'cursor-not-supported',
      path: '/cursor'
    })
    const shape = slicePage(rows, null as unknown as Query)
    expect(shape.ok ? null : shape.error).toMatchObject({
      code: 'invalid-query',
      path: ''
    })
    const whole = slicePage(rows, { page: 1, pageSize: 10 })
    expect(whole.ok && whole.rows).not.toBe(rows)
  })
})

describe('C-78 Semantics profile [own]', () => {
  it('lists the profiles of this build', () => {
    expect([...profiles]).toEqual(['tr-1'])
  })

  it('an unknown profile is an error value, not a throw', () => {
    const tr9 = applyQuery(rows, q(), dataset, {
      profile: 'tr-9' as 'tr-1'
    })
    expect(tr9.ok ? null : tr9.error).toMatchObject({ code: 'unknown-profile' })
  })

  it('has no default profile', () => {
    const none = applyQuery(rows, q(), dataset, {} as { profile: 'tr-1' })
    expect(none.ok ? null : Object.keys(none.error).sort()).toEqual([
      'code',
      'message'
    ])
    expect(none.ok ? null : none.error.code).toBe('unknown-profile')
  })

  it('checks the profile before the query', () => {
    const result = applyQuery(rows, null as unknown as Query, dataset, {
      profile: 'tr-0' as 'tr-1'
    })
    expect(result.ok ? null : result.error.code).toBe('unknown-profile')
  })
})

describe('C-80 Filters and search [own]', () => {
  type Typed = Record<string, unknown>
  const typed = defineDataset<Typed>({
    key: 'id',
    fields: {
      id: { type: 'integer' },
      s: { type: 'string', search: true },
      c: { type: 'string', search: true },
      n: { type: 'number' },
      i: { type: 'integer' },
      b: { type: 'bool' },
      d: { type: 'date' },
      t: { type: 'datetime', offset: '+03:00' },
      u: { type: 'datetime' }
    }
  })
  // Row 1 is on 2026-10-06 in +03:00, row 3 just before it; row 2 is null.
  const all: Typed[] = [
    {
      id: 1,
      s: 'I\u015f\u0131k',
      c: '\u0130zmir',
      n: 1.5,
      i: 10,
      b: true,
      d: '2026-10-06',
      t: '2026-10-06T00:30:00+03:00',
      u: '2026-10-06T00:30:00Z'
    },
    { id: 2, s: null, c: null, n: null, i: null, b: null, d: null, t: null },
    {
      id: 3,
      s: 'kar',
      c: 'Ankara',
      n: -0,
      i: -5,
      b: false,
      d: '2026-10-05',
      t: '2026-10-05T20:59:59.999Z',
      u: null
    }
  ]
  const where = (
    rules: { field: string; condition: string; value: unknown }[],
    extra: object = {},
    data: readonly Typed[] = all,
    set: Dataset<Typed> = typed
  ) =>
    applyQuery(data, q({ filters: rules, ...extra }), set, {
      profile: 'tr-1'
    })
  // The ids of the rows, or the error without its message.
  const keys = (result: ReturnType<typeof where>) => {
    if (result.ok) {
      return result.rows.map(row => row.id)
    }
    const error: Partial<LocalQueryError> = { ...result.error }
    expect(typeof error.message).toBe('string')
    delete error.message
    return error
  }
  const rule = (field: string, condition: string, value: unknown) => ({
    field,
    condition,
    value
  })

  // One allowed pair of every cell of semantics.md#condition-by-type.
  it.each([
    ['s', 'Contains', '\u0131\u015f\u0131', [1]],
    ['s', 'NotContains', '\u0131\u015f\u0131', [2, 3]],
    ['s', 'StartsWith', 'K', [3]],
    ['s', 'EndsWith', 'IK', [1]],
    ['s', 'Equal', 'I\u015eIK', [1]],
    ['s', 'NotEqual', 'KAR', [1, 2]],
    ['n', 'Equal', 0, [3]],
    ['n', 'NotEqual', 1.5, [2, 3]],
    ['n', 'GreaterThan', 0, [1]],
    ['n', 'GreaterThanOrEqual', 0, [1, 3]],
    ['n', 'LessThan', 1.5, [3]],
    ['n', 'LessThanOrEqual', 1.5, [1, 3]],
    ['i', 'Equal', 10, [1]],
    ['i', 'NotEqual', 10, [2, 3]],
    ['i', 'GreaterThan', -5, [1]],
    ['i', 'GreaterThanOrEqual', -5, [1, 3]],
    ['i', 'LessThan', 10, [3]],
    ['i', 'LessThanOrEqual', 10, [1, 3]],
    ['b', 'Equal', true, [1]],
    ['b', 'NotEqual', true, [2, 3]],
    ['d', 'Equal', '2026-10-06', [1]],
    ['d', 'NotEqual', '2026-10-06', [2, 3]],
    ['d', 'GreaterThan', '2026-10-05', [1]],
    ['d', 'GreaterThanOrEqual', '2026-10-05', [1, 3]],
    ['d', 'LessThan', '2026-10-06', [3]],
    ['d', 'LessThanOrEqual', '2026-10-05', [3]],
    ['t', 'Equal', '2026-10-06', [1]],
    ['t', 'NotEqual', '2026-10-06', [2, 3]],
    ['t', 'GreaterThan', '2026-10-05', [1]],
    ['t', 'GreaterThanOrEqual', '2026-10-06', [1]],
    ['t', 'LessThan', '2026-10-06', [3]],
    ['t', 'LessThanOrEqual', '2026-10-05', [3]],
    ['t', 'Equal', '2026-10-06T00:30', [1]],
    ['t', 'LessThanOrEqual', '2026-10-05T20:59:59.999Z', [3]],
    ['u', 'GreaterThan', '2026-10-06T00:29:59Z', [1]]
  ])('allows %s %s %j', (field, condition, value, expected) => {
    expect(keys(where([rule(field, condition, value)]))).toEqual(expected)
  })

  // Every refused pair of the matrix, and conditions it does not know.
  it.each([
    ...['Contains', 'NotContains', 'StartsWith', 'EndsWith'].flatMap(
      condition => ['n', 'i', 'b', 'd', 't'].map(field => [field, condition])
    ),
    ...[
      'GreaterThan',
      'GreaterThanOrEqual',
      'LessThan',
      'LessThanOrEqual'
    ].flatMap(condition => ['s', 'b'].map(field => [field, condition])),
    ['s', 'Like'],
    ['s', 'contains'],
    ['s', 'toString'],
    ['s', '__proto__'],
    ['n', 'hasOwnProperty']
  ])('refuses %s %s as unsupported-operator', (field, condition) => {
    expect(keys(where([rule(field, condition, 'x')]))).toEqual({
      code: 'unsupported-operator',
      field,
      rule: 0,
      path: '/filters/0/condition'
    })
  })

  it.each([
    ['s', 'Equal', ''],
    ['s', 'Contains', '\ud800'],
    ['s', 'Equal', 1],
    ['n', 'Equal', '1'],
    ['n', 'Equal', Number.NaN],
    ['n', 'Equal', Number.POSITIVE_INFINITY],
    ['n', 'Equal', true],
    ['i', 'Equal', 2.5],
    ['i', 'Equal', 2 ** 53],
    ['i', 'Equal', '1'],
    ['b', 'Equal', 'true'],
    ['b', 'Equal', 1],
    ['d', 'Equal', '2026-10-06T00:00:00Z'],
    ['d', 'Equal', '2026-02-30'],
    ['d', 'Equal', 20261006],
    ['t', 'Equal', '2026-10-06T00:30:00+14:01'],
    ['t', 'Equal', '2026-10-06t00:30:00Z'],
    ['t', 'Equal', 0],
    ['u', 'Equal', '2026-10-06'],
    ['u', 'Equal', '2026-10-06T00:30']
  ])('refuses %s %s %j as invalid-value', (field, condition, value) => {
    expect(keys(where([rule(field, condition, value)]))).toEqual({
      code: 'invalid-value',
      field,
      rule: 0,
      path: '/filters/0/value'
    })
  })

  it('reports the first rule error in rule order', () => {
    const result = where([rule('s', 'GreaterThan', 'a'), rule('x', 'Equal', 1)])
    expect(result.ok ? null : result.error.code).toBe('unsupported-operator')
    const later = where([rule('s', 'Equal', 'a'), rule('n', 'Equal', 'x')])
    expect(later.ok ? null : later.error).toMatchObject({
      code: 'invalid-value',
      rule: 1
    })
  })

  it('is false on null for a positive condition and true for a negative one', () => {
    expect(keys(where([rule('s', 'Contains', 'a')]))).toEqual([3])
    expect(keys(where([rule('s', 'NotContains', 'zzz')]))).toEqual([1, 2, 3])
    expect(keys(where([rule('n', 'LessThan', 100)]))).toEqual([1, 3])
    expect(keys(where([rule('n', 'NotEqual', 100)]))).toEqual([1, 2, 3])
  })

  it('compares text by its match fold, with no wildcards and no trimming', () => {
    // The four letters of the i family are one; a combining dot composes first.
    expect(keys(where([rule('c', 'StartsWith', 'izm')]))).toEqual([1])
    expect(keys(where([rule('c', 'Equal', 'I\u0307ZM\u0130R')]))).toEqual([1])
    expect(keys(where([rule('s', 'Contains', 'k_r')]))).toEqual([])
    expect(keys(where([rule('s', 'Contains', 'k%')]))).toEqual([])
    expect(keys(where([rule('s', 'Equal', ' kar')]))).toEqual([])
    expect(keys(where([rule('s', 'Equal', 'k\u00e2r')]))).toEqual([])
    // A blank rule value is a value.
    expect(keys(where([rule('s', 'Contains', ' ')]))).toEqual([])
  })

  it('combines a field with OR, an all-negative field with AND, fields with AND', () => {
    // The range trap: two bounds on one field are OR.
    expect(
      keys(where([rule('i', 'GreaterThan', 0), rule('i', 'LessThan', 0)]))
    ).toEqual([1, 3])
    expect(
      keys(
        where([
          rule('s', 'NotEqual', 'kar'),
          rule('s', 'NotContains', '\u0131')
        ])
      )
    ).toEqual([2])
    // A mixed group is OR.
    expect(
      keys(
        where([rule('s', 'Equal', 'kar'), rule('s', 'NotContains', '\u0131')])
      )
    ).toEqual([2, 3])
    expect(
      keys(where([rule('n', 'GreaterThan', 1), rule('b', 'Equal', false)]))
    ).toEqual([])
    expect(
      keys(where([rule('n', 'GreaterThan', -1), rule('b', 'Equal', false)]))
    ).toEqual([3])
  })

  it('does not depend on the order of groups and rules, or on a repeated rule', () => {
    const rules = [
      rule('i', 'Equal', -5),
      rule('s', 'NotEqual', 'x'),
      rule('i', 'Equal', 10),
      rule('b', 'NotEqual', true)
    ]
    const expected = keys(where(rules))
    expect(expected).toEqual([3])
    expect(keys(where(rules.slice().reverse()))).toEqual(expected)
    expect(keys(where([rules[1], rules[3], rules[0], rules[2]]))).toEqual(
      expected
    )
    expect(keys(where(rules.concat(rules)))).toEqual(expected)
  })

  it('counts the rows that match, independent of the page', () => {
    const result = where([rule('n', 'NotEqual', 1.5)], { pageSize: 1, page: 2 })
    expect(result.ok && result.rows.map(row => row.id)).toEqual([3])
    expect(result.ok && result.totalRows).toBe(2)
  })

  it('searches one trimmed, folded needle in the search fields', () => {
    expect(keys(where([], { search: ' \t I\u015eI\n\u00a0' }))).toEqual([1])
    // Either search field matches; null never does.
    expect(keys(where([], { search: 'ANK' }))).toEqual([3])
    expect(keys(where([], { search: 'ar' }))).toEqual([3])
    // One needle, not words; other spaces are not trimmed.
    expect(keys(where([], { search: 'kar ank' }))).toEqual([])
    expect(keys(where([], { search: '\u2003kar' }))).toEqual([])
    // A combining dot in the search composes.
    expect(keys(where([], { search: 'I\u0307z' }))).toEqual([1])
    // With the rules by AND.
    expect(keys(where([rule('i', 'Equal', 10)], { search: 'a' }))).toEqual([])
    expect(keys(where([rule('i', 'Equal', -5)], { search: 'a' }))).toEqual([3])
  })

  it('treats an absent, null or blank search as no search, even without search fields', () => {
    const plain = defineDataset<Typed>({
      key: 'id',
      fields: { id: { type: 'integer' }, n: { type: 'number' } }
    })
    for (const search of [undefined, null, '', ' \t\r\n\u000b\f\u00a0']) {
      const result = where([], { search }, all, plain)
      expect(result.ok && result.totalRows).toBe(3)
    }
    expect(keys(where([], { search: 'a' }, all, plain))).toEqual({
      code: 'search-not-supported',
      path: '/search'
    })
    expect(keys(where([], { search: '\ud800' }))).toEqual({
      code: 'invalid-value',
      path: '/search'
    })
  })

  it('checks the rules before the search and the search before the rows', () => {
    const bad = [{ ...all[0], s: 5 }]
    const rules = where([rule('n', 'Contains', 'x')], { search: 12 }, bad)
    expect(rules.ok ? null : rules.error.code).toBe('unsupported-operator')
    const search = where([], { search: 12 }, bad)
    expect(search.ok ? null : search.error).toMatchObject({
      code: 'invalid-query',
      path: '/search'
    })
    const data = where([], { search: 'x' }, bad)
    expect(data.ok ? null : data.error).toMatchObject({
      code: 'invalid-data',
      field: 's',
      row: 0
    })
  })

  it('reads a field used by sort, rules and search once per row', () => {
    let calls = 0
    const counted = defineDataset<Typed>({
      key: 'id',
      fields: {
        id: { type: 'integer' },
        s: {
          type: 'string',
          search: true,
          get: row => {
            calls++
            return row.s
          }
        }
      }
    })
    const result = where(
      [rule('s', 'Contains', 'a'), rule('s', 'NotEqual', 'x')],
      { search: 'a', sort: { field: 's', direction: 'asc' } },
      all,
      counted
    )
    expect(keys(result)).toEqual([3])
    expect(calls).toBe(all.length)
  })

  it('never writes the rules or the rows', () => {
    const rules = deepFreeze([
      rule('s', 'Contains', 'a'),
      rule('d', 'Equal', '2026-10-05')
    ])
    const frozen = deepFreeze(all.map(row => ({ ...row })))
    const result = where(rules, { search: 'a' }, frozen)
    expect(result.ok && result.rows[0]).toBe(frozen[2])
  })
})
