import type { CursorQuery, PageQuery } from '@dolusoft/query-protocol'
import { describe, expect, it } from 'vitest'

import { start } from './support/table'
import {
  applyColumnFilters,
  fromSorting,
  pageCountOf,
  projectServerQuery,
  toPageCount
} from '../src/features/server-query'

const cursorQuery: CursorQuery = {
  cursor: null,
  pageSize: 10,
  sort: null,
  filters: []
}

describe('projection of the query onto TanStack state', () => {
  it('projects every slice the query owns', () => {
    const query: PageQuery = start({
      page: 3,
      pageSize: 20,
      sort: { field: 'a', direction: 'desc' },
      filters: [
        { field: 'b', condition: 'Equal', value: 1 },
        { field: 'c', condition: 'Equal', value: 2 },
        { field: 'b', condition: 'Equal', value: 3 }
      ],
      search: 's'
    })
    expect(projectServerQuery({ query, rowCount: 100, pageRows: 20 })).toEqual({
      state: {
        sorting: [{ id: 'a', desc: true }],
        columnFilters: [
          { id: 'b', value: [query.filters[0], query.filters[2]] },
          { id: 'c', value: [query.filters[1]] }
        ],
        pagination: { pageIndex: 2, pageSize: 20 },
        globalFilter: 's'
      },
      pageCount: 5
    })
  })

  it('reads the first sort entry only', () => {
    expect(fromSorting([])).toBeNull()
    expect(
      fromSorting([
        { id: 'a', desc: false },
        { id: 'b', desc: true }
      ])
    ).toEqual({ field: 'a', direction: 'asc' })
  })

  it('applyColumnFilters leaves a field whose entry is not a rule list', () => {
    const filters = [{ field: 'a', condition: 'Equal' as const, value: 1 }]
    expect(applyColumnFilters(filters, [{ id: 'a', value: 'x' }])).toBe(filters)
    expect(applyColumnFilters(filters, [])).toEqual([])
  })
})

describe('C-23 Page count and neighbours [own]', () => {
  it('known total: ceil, at least 1', () => {
    expect(pageCountOf(0, 10)).toBe(1)
    expect(pageCountOf(21, 10)).toBe(3)
  })

  it('unknown total: -1 while the page is full, else the current page', () => {
    expect(toPageCount({ query: start({ page: 2 }), pageRows: 10 })).toBe(-1)
    expect(toPageCount({ query: start({ page: 2 }), pageRows: 9 })).toBe(2)
    expect(
      toPageCount({ query: start({ page: 2 }), rowCount: null, pageRows: 0 })
    ).toBe(2)
  })
})

describe('C-56 Cursor paging [own]', () => {
  it('projects the position onto pageIndex and the neighbours onto pageCount', () => {
    const at = (next: string | null, prev: string | null) => {
      const { state, pageCount } = projectServerQuery({
        query: cursorQuery,
        cursors: { next, prev },
        pageRows: 10
      })
      return [state.pagination.pageIndex, pageCount]
    }
    expect(at(null, null)).toEqual([0, 1])
    expect(at('n', null)).toEqual([0, 2])
    expect(at(null, 'p')).toEqual([1, 2])
    expect(at('n', 'p')).toEqual([1, 3])
  })
})
