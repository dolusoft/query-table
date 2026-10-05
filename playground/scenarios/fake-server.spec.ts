import { describe, expect, test } from 'vitest'

import { createDemoRows, queryDemoRows } from './fake-server'
import type { FilterRule, TableQuery } from '../../src/contract'

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
  test('creates 200 repeatable rows with unique identities', () => {
    const data = createDemoRows()
    expect(data).toHaveLength(200)
    expect(new Set(data.map(row => row.id)).size).toBe(200)
    expect(createDemoRows()).toEqual(data)
  })

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
