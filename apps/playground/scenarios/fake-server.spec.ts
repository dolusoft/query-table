import { describe, expect, test } from 'vitest'

import type { FilterRule, TableQuery } from '@dolusoft/query-table'

import { cursorDemoPage, queryDemoRows, searchDemoRows } from './fake-server'

const rows = [
  {
    id: 1,
    name: 'Alice',
    city: 'Ankara',
    age: 9,
    salary: 42000,
    joined: '2024-01-01'
  },
  {
    id: 2,
    name: 'Bob',
    city: 'Bursa',
    age: 30,
    salary: 51000,
    joined: '2024-02-15'
  },
  {
    id: 3,
    name: 'Carol',
    city: 'Ankara',
    age: 40,
    salary: 62000,
    joined: '2024-12-31'
  }
]
const query = (overrides: Partial<TableQuery> = {}): TableQuery => ({
  page: 1,
  pageSize: 15,
  sort: null,
  filters: [],
  ...overrides
})
const rule = (
  field: string,
  condition: FilterRule['condition'],
  value: FilterRule['value']
): FilterRule => ({ field, condition, value })
const ids = (filters: FilterRule[]) =>
  queryDemoRows(rows, query({ filters })).rows.map(row => row.id)

describe('the demo consumer evaluates the server query contract', () => {
  test.each<[FilterRule, number[]]>([
    [rule('name', 'Contains', 'AL'), [1]],
    [rule('name', 'NotContains', 'o'), [1]],
    [rule('name', 'Equal', 'BOB'), [2]],
    [rule('name', 'NotEqual', 'Bob'), [1, 3]],
    [rule('name', 'StartsWith', 'ca'), [3]],
    [rule('name', 'EndsWith', 'CE'), [1]],
    [rule('age', 'GreaterThan', 30), [3]],
    [rule('age', 'GreaterThanOrEqual', 30), [2, 3]],
    [rule('age', 'LessThan', 30), [1]],
    [rule('age', 'LessThanOrEqual', 30), [1, 2]],
    [rule('age', 'Equal', 30), [2]],
    [rule('age', 'NotEqual', 30), [1, 3]],
    [rule('joined', 'GreaterThan', '2024-02-15'), [3]],
    [rule('joined', 'LessThanOrEqual', '2024-02-15'), [1, 2]],
    [rule('joined', 'Equal', '2024-02-15'), [2]],
    [rule('name', 'Contains', 'zzz'), []]
  ])('applies %j', (filter, expected) => {
    expect(ids([filter])).toEqual(expected)
  })

  test('combines same-field positives with OR and different fields with AND', () => {
    expect(
      ids([rule('name', 'Equal', 'Alice'), rule('name', 'Equal', 'Bob')])
    ).toEqual([1, 2])
    expect(
      ids([
        rule('name', 'Equal', 'Alice'),
        rule('name', 'Equal', 'Bob'),
        rule('city', 'Equal', 'Ankara')
      ])
    ).toEqual([1])
  })

  test('combines all-negative same-field rules with AND', () => {
    expect(
      ids([
        rule('name', 'NotEqual', 'Alice'),
        rule('name', 'NotContains', 'ob')
      ])
    ).toEqual([3])
  })

  test('mixed positive and negative rules still combine with OR', () => {
    expect(
      ids([rule('name', 'Equal', 'Alice'), rule('name', 'NotEqual', 'Bob')])
    ).toEqual([1, 3])
  })

  test('filters then sorts numerically then slices, keeping the filtered total', () => {
    const before = structuredClone(rows)
    const result = queryDemoRows(
      rows,
      query({
        page: 2,
        pageSize: 1,
        filters: [rule('city', 'Equal', 'Ankara')],
        sort: { field: 'age', direction: 'desc' }
      })
    )
    expect(result).toEqual({ rows: [rows[0]], totalRows: 2 })
    expect(rows).toEqual(before)
  })

  test('sorts text and ISO dates in both directions', () => {
    for (const field of ['name', 'joined']) {
      expect(
        queryDemoRows(
          rows,
          query({ sort: { field, direction: 'asc' } })
        ).rows.map(row => row.id)
      ).toEqual([1, 2, 3])
      expect(
        queryDemoRows(
          rows,
          query({ sort: { field, direction: 'desc' } })
        ).rows.map(row => row.id)
      ).toEqual([3, 2, 1])
    }
  })

  test('compares a date-time value with a date-only rule by day', () => {
    const events = [
      { id: 1, time: '2026-09-13T23:59:59' },
      { id: 2, time: '2026-09-14T00:00:00' },
      { id: 3, time: '2026-09-14T18:30:00' },
      { id: 4, time: '2026-09-15T08:00:00' }
    ]
    const match = (filter: FilterRule) =>
      queryDemoRows(events, query({ filters: [filter] })).rows.map(
        row => row.id
      )
    expect(match(rule('time', 'Equal', '2026-09-14'))).toEqual([2, 3])
    expect(match(rule('time', 'GreaterThan', '2026-09-14'))).toEqual([4])
    expect(match(rule('time', 'LessThanOrEqual', '2026-09-14'))).toEqual([
      1, 2, 3
    ])
    expect(match(rule('time', 'GreaterThan', '2026-09-14T12:00'))).toEqual([
      3, 4
    ])
  })

  test('returns the final partial page, then no rows beyond the total', () => {
    expect(queryDemoRows(rows, query({ page: 2, pageSize: 2 }))).toEqual({
      rows: [rows[2]],
      totalRows: 3
    })
    expect(queryDemoRows(rows, query({ page: 3, pageSize: 2 }))).toEqual({
      rows: [],
      totalRows: 3
    })
  })
})

describe('cursor pages and search of the demo server', () => {
  const all = Array.from({ length: 200 }, (_, i) => ({
    id: i + 1,
    name: ['Alice', 'Bob', 'Carol', 'Dave'][i % 4],
    city: ['Ankara', 'Bursa', 'İzmir', 'Antalya', 'Muğla'][i % 5]
  }))
  const fields = ['name', 'city']
  const base = { pageSize: 10, sort: null, filters: [] }

  test('the first page has a next cursor and no previous one', () => {
    const first = cursorDemoPage(all, { ...base, cursor: null }, fields)
    expect(first.rows.map(row => row.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10
    ])
    expect(first.cursors.prev).toBeNull()
    expect(first.cursors.next).not.toBeNull()
  })

  test('a next cursor leads to the following page and back', () => {
    const first = cursorDemoPage(all, { ...base, cursor: null }, fields)
    const second = cursorDemoPage(
      all,
      { ...base, cursor: { token: first.cursors.next!, direction: 'next' } },
      fields
    )
    expect(second.rows[0]?.id).toBe(11)
    const back = cursorDemoPage(
      all,
      { ...base, cursor: { token: second.cursors.prev!, direction: 'prev' } },
      fields
    )
    expect(back.rows[0]?.id).toBe(1)
  })

  test('the last page has no next cursor', () => {
    const last = cursorDemoPage(
      all,
      { ...base, cursor: { token: btoa('190'), direction: 'next' } },
      fields
    )
    expect(last.rows).toHaveLength(10)
    expect(last.cursors.next).toBeNull()
  })

  test('search matches the given fields, case-insensitive, and blank matches all', () => {
    const alice = searchDemoRows(all, 'alice', fields)
    expect(alice).toHaveLength(50)
    expect(alice.every(row => row.name === 'Alice')).toBe(true)
    expect(searchDemoRows(all, 'bursa', fields)).toHaveLength(40)
    expect(searchDemoRows(all, 'bursa', ['name'])).toHaveLength(0)
    expect(searchDemoRows(all, '  ', fields)).toHaveLength(all.length)
  })
})
