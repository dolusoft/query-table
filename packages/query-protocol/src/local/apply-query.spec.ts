import { describe, expect, it } from 'vitest'

import { applyQuery, slicePage } from './apply-query'
import type { Dataset } from './dataset'
import { defineDataset } from './dataset'
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
