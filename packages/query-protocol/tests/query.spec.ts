import { describe, expect, it } from 'vitest'

import {
  cloneQuery,
  type CursorQuery,
  type FilterRule,
  isCursorQuery,
  type PageQuery,
  type Query,
  replaceRules,
  rulesOf,
  sameQuery,
  searchOf,
  withSearch
} from '../src'

const rule = (field: string, value: string): FilterRule => ({
  field,
  condition: 'Equal',
  value
})

const pageQuery = (patch: Partial<PageQuery> = {}): PageQuery => ({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: [],
  ...patch
})

const cursorQuery = (patch: Partial<CursorQuery> = {}): CursorQuery => ({
  cursor: null,
  pageSize: 10,
  sort: null,
  filters: [],
  ...patch
})

describe('replaceRules', () => {
  const filters = [rule('a', '1'), rule('b', '2'), rule('c', '3')]

  it('puts the new rules where the first old one was', () => {
    expect(
      replaceRules(filters, 'b', [rule('b', 'x'), rule('b', 'y')])
    ).toEqual([rule('a', '1'), rule('b', 'x'), rule('b', 'y'), rule('c', '3')])
  })

  it('removes the field when given no rule', () => {
    expect(replaceRules(filters, 'b', [])).toEqual([
      rule('a', '1'),
      rule('c', '3')
    ])
  })

  it('appends a field that had no rule', () => {
    expect(replaceRules(filters, 'd', [rule('d', '4')])).toEqual([
      ...filters,
      rule('d', '4')
    ])
  })

  it('gathers a field split across the list at its first place', () => {
    const split = [
      rule('a', '1'),
      rule('b', '2'),
      rule('a', '3'),
      rule('c', '4')
    ]
    expect(replaceRules(split, 'a', [rule('a', 'x')])).toEqual([
      rule('a', 'x'),
      rule('b', '2'),
      rule('c', '4')
    ])
  })

  it('does not mutate its input', () => {
    const before = structuredClone(filters)
    replaceRules(filters, 'a', [])
    expect(filters).toEqual(before)
  })

  it('rulesOf keeps the order of one field', () => {
    const list = [rule('a', '1'), rule('b', '2'), rule('a', '3')]
    expect(rulesOf(list, 'a')).toEqual([rule('a', '1'), rule('a', '3')])
  })
})

describe('C-60 keys the protocol does not know pass through', () => {
  const query = {
    ...pageQuery({
      filters: [{ ...rule('a', '1'), note: 'kept' } as FilterRule]
    }),
    tenant: { id: 7, tags: ['x'] }
  } as Query
  const tenantOf = (value: Query) =>
    (value as unknown as { tenant: object }).tenant

  it('cloneQuery copies everything and shares no object', () => {
    const copy = cloneQuery(query)
    expect(copy).toEqual(query)
    expect(copy).not.toBe(query)
    expect(copy.filters).not.toBe(query.filters)
    expect(copy.filters[0]).not.toBe(query.filters[0])
    expect(tenantOf(copy)).not.toBe(tenantOf(query))
  })

  it('sameQuery compares the unknown keys too', () => {
    expect(sameQuery(query, cloneQuery(query))).toBe(true)
    const other = { ...cloneQuery(query), tenant: { id: 8, tags: ['x'] } }
    expect(sameQuery(query, other as Query)).toBe(false)
  })

  it('sameQuery ignores the extra properties of a rule', () => {
    expect(
      sameQuery(
        pageQuery({ filters: [rule('a', '1')] }),
        pageQuery({
          filters: [{ ...rule('a', '1'), note: 'x' } as FilterRule]
        })
      )
    ).toBe(true)
  })
})

describe('sameQuery', () => {
  it('compares page, size, sort, rules and search', () => {
    const base = pageQuery()
    expect(sameQuery(base, pageQuery())).toBe(true)
    expect(sameQuery(base, pageQuery({ page: 2 }))).toBe(false)
    expect(sameQuery(base, pageQuery({ pageSize: 20 }))).toBe(false)
    expect(
      sameQuery(base, pageQuery({ sort: { field: 'a', direction: 'asc' } }))
    ).toBe(false)
    expect(sameQuery(base, pageQuery({ filters: [rule('a', '1')] }))).toBe(
      false
    )
    expect(sameQuery(base, pageQuery({ search: 'x' }))).toBe(false)
  })

  it('treats an absent search and an empty one alike', () => {
    expect(sameQuery(pageQuery(), pageQuery({ search: '' }))).toBe(true)
  })

  it('never equates a page query and a cursor query', () => {
    expect(sameQuery(pageQuery(), cursorQuery())).toBe(false)
  })

  it('compares cursors by content', () => {
    const next = { token: 't', direction: 'next' } as const
    expect(
      sameQuery(
        cursorQuery({ cursor: next }),
        cursorQuery({ cursor: { ...next } })
      )
    ).toBe(true)
    expect(sameQuery(cursorQuery({ cursor: next }), cursorQuery())).toBe(false)
  })
})

describe('C-56 cursor mode', () => {
  it('is the mode of a query with a cursor key', () => {
    expect(isCursorQuery(cursorQuery())).toBe(true)
    expect(isCursorQuery(pageQuery())).toBe(false)
  })
})

describe('C-58 search', () => {
  it('withSearch keeps the text as given and removes the key for empty text', () => {
    expect(withSearch(pageQuery(), ' a b ').search).toBe(' a b ')
    const cleared = withSearch(pageQuery({ search: 'x' }), '')
    expect('search' in cleared).toBe(false)
    expect(searchOf(cleared)).toBe('')
  })
})
