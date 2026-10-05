import { describe, expect, it } from 'vitest'

import {
  conditionLabel,
  defaultConditionFor,
  filterConditions,
  isUnaryCondition
} from '../src/model/filter-conditions'
import {
  columnTypeOf,
  nextDirection,
  replaceRules,
  sameQuery,
  valueAt
} from '../src/model/query'
import { makeQuery } from '../test-support/mount-table'

describe('filter conditions per column type', () => {
  it('no list contains an empty "no filter" entry', () => {
    for (const list of Object.values(filterConditions)) {
      expect(list.every(option => option.value !== ('' as never))).toBe(true)
    }
  })

  it('every list ends with the two emptiness conditions, except bool', () => {
    for (const [type, list] of Object.entries(filterConditions)) {
      const tail = list.slice(-2).map(option => option.value)
      expect(tail).toEqual(
        type === 'bool' ? ['Equal', 'NotEqual'] : ['IsNull', 'IsNotNull']
      )
    }
  })

  it('C-16 text matches by Contains, every other type exactly', () => {
    expect(defaultConditionFor('string')).toBe('Contains')
    for (const type of [
      'number',
      'integer',
      'date',
      'datetime',
      'bool'
    ] as const) {
      expect(defaultConditionFor(type)).toBe('Equal')
    }
  })

  it('labels a condition and falls back to its name', () => {
    expect(conditionLabel('string', 'StartsWith')).toBe('Starts With')
    expect(conditionLabel('bool', 'Contains')).toBe('Contains')
    expect(isUnaryCondition('IsNull')).toBe(true)
    expect(isUnaryCondition('Equal')).toBe(false)
    expect(isUnaryCondition(null)).toBe(false)
  })
})

describe('C-39 column types are read case-insensitively', () => {
  it('lower-cases the type and defaults to string', () => {
    expect(columnTypeOf({ field: 'a', type: 'String' as never })).toBe('string')
    expect(columnTypeOf({ field: 'a', type: 'DateTime' as never })).toBe(
      'datetime'
    )
    expect(columnTypeOf({ field: 'a' })).toBe('string')
    expect(columnTypeOf({ field: 'a', type: 'nonsense' as never })).toBe(
      'string'
    )
  })
})

describe('query helpers', () => {
  it('reads dotted paths and tolerates holes', () => {
    expect(valueAt({ a: { b: 3 } }, 'a.b')).toBe(3)
    expect(valueAt({ a: null }, 'a.b')).toBeUndefined()
    expect(valueAt({}, 'a.b')).toBeUndefined()
  })

  it('replaces the rules of one field in place', () => {
    const rule = (field: string, value: string) => ({
      field,
      condition: 'Equal' as const,
      value
    })
    const filters = [rule('a', '1'), rule('b', '2'), rule('c', '3')]
    expect(
      replaceRules(filters, 'b', [rule('b', 'x'), rule('b', 'y')])
    ).toEqual([rule('a', '1'), rule('b', 'x'), rule('b', 'y'), rule('c', '3')])
    expect(replaceRules(filters, 'b', [])).toEqual([
      rule('a', '1'),
      rule('c', '3')
    ])
    expect(replaceRules(filters, 'z', [rule('z', '9')])).toEqual([
      ...filters,
      rule('z', '9')
    ])
  })

  it('compares queries deeply', () => {
    const a = makeQuery({ sort: { field: 'a', direction: 'asc' } })
    expect(sameQuery(a, structuredClone(a))).toBe(true)
    expect(sameQuery(a, makeQuery())).toBe(false)
    expect(sameQuery(a, { ...a, page: 2 })).toBe(false)
  })

  it('C-07 sorts ascending first, then flips', () => {
    expect(nextDirection(null, 'a')).toBe('asc')
    expect(nextDirection({ field: 'a', direction: 'asc' }, 'a')).toBe('desc')
    expect(nextDirection({ field: 'a', direction: 'desc' }, 'a')).toBe('asc')
    expect(nextDirection({ field: 'a', direction: 'desc' }, 'b')).toBe('asc')
  })
})
