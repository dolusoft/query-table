import { describe, expect, it } from 'vitest'

import { replaceRules, sameQuery } from './query'
import { makeQuery } from '../../tests/support/mount-table'

describe('query helpers', () => {
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
})
