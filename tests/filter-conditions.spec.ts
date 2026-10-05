import { describe, expect, it } from 'vitest'

import { filterConditions } from '../src/model/filter-conditions'

import { flush, mountTable } from './helpers'

const values = (type: string) => filterConditions[type].map(c => c.value)

describe('filterConditions — per-type lists', () => {
  it('exposes exactly these types', () => {
    expect(Object.keys(filterConditions)).toEqual([
      'string',
      'number',
      'integer',
      'date',
      'datetime',
      'bool'
    ])
  })

  it('string', () => {
    expect(values('string')).toEqual([
      '',
      'Contains',
      'NotContains',
      'Equal',
      'NotEqual',
      'StartsWith',
      'EndsWith',
      'IsNull',
      'IsNotNull'
    ])
  })

  it.each(['number', 'integer'])('%s', type => {
    expect(values(type)).toEqual([
      '',
      'Equal',
      'NotEqual',
      'GreaterThan',
      'GreaterThanOrEqual',
      'LessThan',
      'LessThanOrEqual',
      'IsNull',
      'IsNotNull'
    ])
  })

  it.each(['date', 'datetime'])('%s', type => {
    expect(values(type)).toEqual([
      '',
      'Equal',
      'NotEqual',
      'GreaterThan',
      'LessThan',
      'IsNull',
      'IsNotNull'
    ])
  })

  it('bool', () => {
    expect(values('bool')).toEqual(['', 'Equal', 'NotEqual'])
  })

  it('every list starts with the "No Filter" entry', () => {
    for (const list of Object.values(filterConditions)) {
      expect(list[0]).toEqual({ value: '', label: 'No Filter', icon: '' })
    }
  })

  it('labels are stable', () => {
    expect(filterConditions.string.map(c => c.label)).toMatchInlineSnapshot(`
      [
        "No Filter",
        "Contains",
        "Not Contains",
        "Equal (=)",
        "Not Equal (≠)",
        "Starts With",
        "Ends With",
        "Is Empty",
        "Is Not Empty",
      ]
    `)
    expect(
      filterConditions.date.find(c => c.value === 'GreaterThan')?.label
    ).toBe('After (>)')
  })
})

describe('default condition for a column type', () => {
  it('initial column value: text → Contains, others → Equal, no value → empty', async () => {
    const columns = [
      { field: 'a', value: 'x' },
      { field: 'b', type: 'String', value: 'x' },
      { field: 'c', type: 'number', value: 1 },
      { field: 'd', type: 'date', value: '2024-01-01' },
      { field: 'e', type: 'integer', value: 1 },
      { field: 'f', type: 'bool', value: true },
      { field: 'g', type: 'number' },
      { field: 'h', value: 'x', condition: 'EndsWith' }
    ]
    mountTable({ columns, rows: [] })
    await flush()
    expect(columns.map(c => (c as any).condition)).toEqual([
      'Contains',
      // type is lower-cased first, so 'String' becomes 'string'
      'Contains',
      'Equal',
      'Equal',
      'Equal',
      'Equal',
      '',
      'EndsWith'
    ])
    expect(columns[1].type).toBe('string')
  })
})
