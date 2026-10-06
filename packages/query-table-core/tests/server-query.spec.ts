import type { CursorQuery, FilterRule, Query } from '@dolusoft/query-protocol'
import {
  columnFilteringFeature,
  constructTable,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'
import { describe, expect, it, vi } from 'vitest'

import { serverQueryFeature } from '../src/features/server-query'
import { onBeforeAction } from '../src/shared'
import { makeTable, rowsOf, start, tick } from './support/table'

const rule = (field: string, value: string | number): FilterRule => ({
  field,
  condition: 'Equal',
  value
})

const cursorStart = (patch: Partial<CursorQuery> = {}): CursorQuery => ({
  cursor: null,
  pageSize: 10,
  sort: null,
  filters: [],
  ...patch
})

describe('C-61 the plugin owns the query handlers [own]', () => {
  const features = tableFeatures({
    coreReactivityFeature: storeReactivityBindings(),
    rowSortingFeature,
    rowPaginationFeature,
    columnFilteringFeature,
    globalFilteringFeature,
    serverQueryFeature
  })
  const base = {
    features,
    columns: [{ id: 'name', accessorKey: 'name' as const }],
    data: [{ name: 'a' }],
    query: start(),
    onQueryChange: () => {}
  }

  it('pins getDefaultTableOptions', () => {
    const { table } = makeTable()
    const defaults = serverQueryFeature.getDefaultTableOptions!(table)
    expect(defaults).toMatchObject({
      manualSorting: true,
      manualFiltering: true,
      manualPagination: true,
      sortDescFirst: false,
      enableMultiSort: false
    })
    expect(Object.keys(defaults).sort()).toEqual(
      [
        'enableMultiSort',
        'manualFiltering',
        'manualPagination',
        'manualSorting',
        'onColumnFiltersChange',
        'onGlobalFilterChange',
        'onPaginationChange',
        'onSortingChange',
        'sortDescFirst'
      ].sort()
    )
    // The handlers in effect are the plugin's, one set per table.
    for (const key of [
      'onSortingChange',
      'onColumnFiltersChange',
      'onPaginationChange',
      'onGlobalFilterChange'
    ] as const) {
      expect(table.options[key]).toBe(defaults[key])
    }
  })

  it.each([
    ['onSortingChange', { onSortingChange: () => {} }],
    ['onPaginationChange', { onPaginationChange: () => {} }],
    ['onColumnFiltersChange', { onColumnFiltersChange: () => {} }],
    ['onGlobalFilterChange', { onGlobalFilterChange: () => {} }],
    ['manualPagination', { manualPagination: false }],
    ['sortDescFirst', { sortDescFirst: true }],
    ['enableMultiSort', { enableMultiSort: true }]
  ])('throws when the options replace %s', (key, patch) => {
    expect(() => constructTable({ ...base, ...patch })).toThrow(key)
  })

  it('accepts the options it owns when they say the same', () => {
    expect(() =>
      constructTable({ ...base, manualSorting: true, enableMultiSort: false })
    ).not.toThrow()
  })
})

describe('C-01 The table is controlled [own]', () => {
  it('emits nothing on construction or when the query changes from outside', () => {
    const t = makeTable()
    t.setQuery(start({ page: 2, sort: { field: 'age', direction: 'desc' } }))
    expect(t.updates).toEqual([])
    expect(t.table.store.state.sorting).toEqual([{ id: 'age', desc: true }])
    expect(t.table.store.state.pagination).toEqual({
      pageIndex: 1,
      pageSize: 10
    })
  })

  it('draws a page out of range and an unknown field as given', () => {
    const t = makeTable({
      query: start({ page: 9, sort: { field: 'nope', direction: 'asc' } }),
      rowCount: 30
    })
    expect(t.table.store.state.pagination.pageIndex).toBe(8)
    expect(t.table.store.state.sorting).toEqual([{ id: 'nope', desc: false }])
    expect(t.updates).toEqual([])
  })
})

describe('C-03 Inputs are never mutated [own]', () => {
  it('emits new objects and leaves the query given as it is', () => {
    const query = start({ filters: [rule('name', 'a')] })
    const frozen = structuredClone(query)
    const t = makeTable({ query, answer: 'ignore' })
    t.column('age').toggleQuerySorting()
    const [[next]] = t.updates
    expect(query).toEqual(frozen)
    expect(next).not.toBe(query)
    expect(next.filters).not.toBe(query.filters)
    expect(next.filters[0]).not.toBe(query.filters[0])
  })
})

describe('C-04 One action, one update [own]', () => {
  it('emits nothing for an action that changes nothing', () => {
    const t = makeTable({ query: start({ page: 2 }), rowCount: 50 })
    t.table.setPageIndex(1)
    t.table.setPageSize(10)
    t.table.setColumnFilters([])
    expect(t.updates).toEqual([])
  })
})

describe('C-05 Paging [tanstack] [own]', () => {
  it('steps and sets the page, reason page', () => {
    const t = makeTable({ rowCount: 50 })
    t.table.nextPage()
    t.table.setPageIndex(3)
    t.table.previousPage()
    expect(t.queries().map(query => (query as { page: number }).page)).toEqual([
      2, 4, 3
    ])
    expect(t.reasons()).toEqual(['page', 'page', 'page'])
  })

  it('clamps to the known page range and does nothing at the ends', () => {
    const t = makeTable({ rowCount: 25 })
    t.table.previousPage()
    t.table.setPageIndex(99)
    t.table.nextPage()
    expect(t.queries().map(query => (query as { page: number }).page)).toEqual([
      3
    ])
  })

  it('changes only the page', () => {
    const query = start({
      sort: { field: 'age', direction: 'asc' },
      filters: [rule('name', 'a')],
      search: 's'
    })
    const t = makeTable({ query, rowCount: 50 })
    t.table.nextPage()
    expect(t.queries()).toEqual([{ ...query, page: 2 }])
  })
})

describe('C-06 Page size [own]', () => {
  it('goes back to page 1 instead of keeping the top row', () => {
    const t = makeTable({ query: start({ page: 3 }), rowCount: 100 })
    t.table.setPageSize(25)
    expect(t.updates).toEqual([[start({ pageSize: 25 }), 'pageSize']])
  })

  it('ignores sizes that are not whole numbers', () => {
    const t = makeTable({ rowCount: 100 })
    t.table.setPageSize(2.5)
    t.table.setPageSize(Number.NaN)
    expect(t.updates).toEqual([])
  })
})

describe('C-07 Header sort [own]', () => {
  it('cycles ascending, descending, none and keeps the page', () => {
    const t = makeTable({ query: start({ page: 2 }), rowCount: 50 })
    const age = t.column('age')
    age.toggleQuerySorting()
    age.toggleQuerySorting()
    age.toggleQuerySorting()
    expect(
      t.queries().map(query => [query.sort, (query as { page: number }).page])
    ).toEqual([
      [{ field: 'age', direction: 'asc' }, 2],
      [{ field: 'age', direction: 'desc' }, 2],
      [null, 2]
    ])
    expect(t.reasons()).toEqual(['sort', 'sort', 'sort'])
  })

  it('starts another column at ascending, numbers included', () => {
    const t = makeTable({
      query: start({ sort: { field: 'name', direction: 'desc' } })
    })
    t.column('age').toggleQuerySorting()
    expect(t.queries()[0].sort).toEqual({ field: 'age', direction: 'asc' })
  })

  it('does nothing for a column that cannot sort', () => {
    const t = makeTable()
    t.column('note').toggleQuerySorting()
    expect(t.updates).toEqual([])
  })

  it('keeps a single sort', () => {
    const t = makeTable()
    t.table.setSorting([
      { id: 'age', desc: false },
      { id: 'name', desc: true }
    ])
    expect(t.queries()[0].sort).toEqual({ field: 'age', direction: 'asc' })
  })
})

describe('C-10 Other rules pass through [own]', () => {
  it('replaces the rules of one column only, in place', () => {
    const filters = [
      rule('hidden', 1),
      rule('age', 2),
      { ...rule('name', 'a'), note: 'kept' } as FilterRule
    ]
    const t = makeTable({ query: start({ page: 3, filters }), rowCount: 100 })
    t.column('age').setFilterValue([rule('age', 5), rule('age', 6)])
    expect(t.updates).toEqual([
      [
        start({
          filters: [
            rule('hidden', 1),
            rule('age', 5),
            rule('age', 6),
            filters[2]
          ]
        }),
        'filter'
      ]
    ])
  })

  it('ignores an entry value that is not a rule list', () => {
    const t = makeTable({ query: start({ filters: [rule('age', 2)] }) })
    t.table.setColumnFilters([{ id: 'age', value: 'text' }])
    expect(t.updates).toEqual([])
  })
})

describe('C-14 two updates in one tick stack [own]', () => {
  it('a consumer that ignores: the second action builds on the first', async () => {
    const t = makeTable({ answer: 'ignore', rowCount: 100 })
    t.column('age').toggleQuerySorting()
    t.column('age').toggleQuerySorting()
    t.table.nextPage()
    expect(
      t
        .queries()
        .map(query => [query.sort?.direction, (query as { page: number }).page])
    ).toEqual([
      ['asc', 1],
      ['desc', 1],
      ['desc', 2]
    ])
    await tick()
    // C-19: the tick is over, the base is the query the consumer holds.
    t.table.nextPage()
    expect(t.queries()[3]).toEqual(start({ page: 2 }))
  })

  it('a consumer that answers in the next microtask: same result', async () => {
    const t = makeTable({ answer: 'deferred', rowCount: 100 })
    t.table.nextPage()
    t.table.nextPage()
    await tick()
    expect(t.queries().map(query => (query as { page: number }).page)).toEqual([
      2, 3
    ])
    expect(t.query).toEqual(start({ page: 3 }))
  })

  it('a filter action does not run the before-action flushes', () => {
    const t = makeTable({ rowCount: 100 })
    const flush = vi.fn()
    onBeforeAction(t.table, flush)
    t.column('age').setFilterValue([rule('age', 1)])
    expect(flush).not.toHaveBeenCalled()
    t.table.nextPage()
    t.column('age').toggleQuerySorting()
    t.table.setPageSize(20)
    t.table.setGlobalFilter('x')
    expect(flush).toHaveBeenCalledTimes(4)
  })

  it('drops a page step when a flush emitted, but not a size change', () => {
    const t = makeTable({ rowCount: 100 })
    onBeforeAction(t.table, () =>
      t.column('name').setFilterValue([rule('name', 'a')])
    )
    t.table.nextPage()
    expect(t.reasons()).toEqual(['filter'])
    t.column('name').setFilterValue([rule('name', 'b')])
    t.table.setPageSize(20)
    expect(t.reasons()).toEqual(['filter', 'filter', 'filter', 'pageSize'])
  })
})

describe('C-19 An ignored update changes nothing [own]', () => {
  it('keeps drawing the old query', async () => {
    const t = makeTable({ answer: 'ignore', rowCount: 100 })
    t.table.nextPage()
    await tick()
    expect(t.table.store.state.pagination.pageIndex).toBe(0)
    expect(t.table.getBaseQuery()).toEqual(start())
  })

  it('getBaseQuery includes the unanswered emit until the tick ends', async () => {
    const t = makeTable({ answer: 'ignore', rowCount: 100 })
    t.table.nextPage()
    expect(t.table.getBaseQuery()).toEqual(start({ page: 2 }))
    await tick()
    expect(t.table.getBaseQuery()).toEqual(start())
  })
})

describe('C-23 Page count and neighbours [tanstack] [own]', () => {
  it('known total: ceil, at least 1', () => {
    const t = makeTable({ rowCount: 0 })
    expect(t.table.getPageCount()).toBe(1)
    t.setRows(rowsOf(1), 21)
    expect(t.table.getPageCount()).toBe(3)
    expect(t.table.getCanNextPage()).toBe(true)
    expect(t.table.getCanPreviousPage()).toBe(false)
  })

  it('unknown total: a full page has a next, a short one does not', () => {
    const t = makeTable({ query: start({ pageSize: 2 }), rows: rowsOf(1, 2) })
    expect(t.table.getCanNextPage()).toBe(true)
    t.setRows(rowsOf(1))
    expect(t.table.getCanNextPage()).toBe(false)
    t.table.nextPage()
    expect(t.updates).toEqual([])
  })
})

describe('C-56 Cursor paging [own]', () => {
  it('a step asks for the cursor on that side', () => {
    const t = makeTable({
      query: cursorStart(),
      cursors: { next: 'n1', prev: null },
      answer: 'ignore'
    })
    expect(t.table.getCanPreviousPage()).toBe(false)
    expect(t.table.getCanNextPage()).toBe(true)
    t.table.nextPage()
    expect(t.updates).toEqual([
      [cursorStart({ cursor: { token: 'n1', direction: 'next' } }), 'page']
    ])
  })

  it('goes back with the previous cursor', () => {
    const t = makeTable({
      query: cursorStart({ cursor: { token: 'n1', direction: 'next' } }),
      cursors: { next: null, prev: 'p1' }
    })
    expect(t.table.getCanNextPage()).toBe(false)
    expect(t.table.getCanPreviousPage()).toBe(true)
    t.table.nextPage()
    t.table.previousPage()
    expect(t.updates).toEqual([
      [cursorStart({ cursor: { token: 'p1', direction: 'prev' } }), 'page']
    ])
  })

  it('does nothing without a cursor or for a jump', () => {
    const t = makeTable({ query: cursorStart(), cursors: null })
    t.table.nextPage()
    t.table.previousPage()
    t.table.setPageIndex(0)
    expect(t.updates).toEqual([])
  })

  it('a page number is a jump: TanStack does not clamp it into a step', () => {
    const t = makeTable({
      query: cursorStart({ cursor: { token: 'n1', direction: 'next' } }),
      cursors: { next: 'n2', prev: 'p1' }
    })
    // Position 1 of 3: 5 would clamp to 2 (next), 0 is one step back.
    t.table.setPageIndex(5)
    t.table.setPageIndex(0)
    t.table.setPageIndex(2)
    t.table.setPageIndex(old => old + 2)
    expect(t.updates).toEqual([])
  })

  it('a step of one through setPageIndex is a cursor request', () => {
    const t = makeTable({
      query: cursorStart({ cursor: { token: 'n1', direction: 'next' } }),
      cursors: { next: 'n2', prev: 'p1' },
      answer: 'ignore'
    })
    t.table.setPageIndex(old => old + 1)
    expect(t.updates).toEqual([
      [cursorStart({ cursor: { token: 'n2', direction: 'next' } }), 'page']
    ])
  })

  it('page mode still clamps a page number to the range', () => {
    const t = makeTable({ rowCount: 30, answer: 'ignore' })
    t.table.setPageIndex(5)
    expect(t.queries()).toEqual([start({ page: 3 })])
  })
})

describe('C-57 Cursor mode starts over [own]', () => {
  const at = { token: 'n1', direction: 'next' } as const
  const make = () =>
    makeTable({
      query: cursorStart({ cursor: at }),
      cursors: { next: 'n2', prev: 'p1' }
    })

  it('on a sort: the cursor belongs to the old order', () => {
    const t = make()
    t.column('age').toggleQuerySorting()
    expect(t.queries()[0]).toEqual(
      cursorStart({ sort: { field: 'age', direction: 'asc' } })
    )
  })

  it('on a filter, a page size and a search', () => {
    const t = make()
    t.column('age').setFilterValue([rule('age', 1)])
    t.setQuery(cursorStart({ cursor: at }))
    t.table.setPageSize(50)
    t.setQuery(cursorStart({ cursor: at }))
    t.table.setGlobalFilter('x')
    expect(t.queries().map(query => (query as CursorQuery).cursor)).toEqual([
      null,
      null,
      null
    ])
    expect(t.reasons()).toEqual(['filter', 'pageSize', 'search'])
  })

  it('page mode keeps the page on a sort (C-07) and goes to page 1 on the rest', () => {
    const t = makeTable({ query: start({ page: 3 }), rowCount: 100 })
    t.column('age').toggleQuerySorting()
    expect((t.query as { page: number }).page).toBe(3)
    t.table.setGlobalFilter('x')
    expect((t.query as { page: number }).page).toBe(1)
  })
})

describe('C-58 Global search [tanstack] [own]', () => {
  it('setGlobalFilter emits the search, reason search, page 1', () => {
    const t = makeTable({ query: start({ page: 2 }), rowCount: 100 })
    t.table.setGlobalFilter('ank')
    expect(t.updates).toEqual([[start({ search: 'ank' }), 'search']])
    expect(t.table.store.state.globalFilter).toBe('ank')
  })

  it('empty text removes the key; the same text emits nothing', () => {
    const t = makeTable({ query: start({ search: 'a' }) })
    t.table.setGlobalFilter('a')
    expect(t.updates).toEqual([])
    t.table.setGlobalFilter('')
    expect(t.updates).toHaveLength(1)
    expect('search' in t.updates[0][0]).toBe(false)
    t.table.resetGlobalFilter(true)
    expect(t.updates).toHaveLength(1)
  })

  it('the same text emits nothing on page 2 either', () => {
    const t = makeTable({ query: start({ page: 2, search: 'a' }) })
    t.table.setGlobalFilter('a')
    const blank = makeTable({ query: start({ page: 2 }) })
    blank.table.setGlobalFilter('')
    expect([...t.updates, ...blank.updates]).toEqual([])
  })

  it('the same text emits nothing in cursor mode past the first page', () => {
    const t = makeTable({
      query: cursorStart({
        cursor: { token: 'n1', direction: 'next' },
        search: 'a'
      }),
      cursors: { next: 'n2', prev: 'p1' }
    })
    t.table.setGlobalFilter('a')
    expect(t.updates).toEqual([])
  })
})

describe('C-14 the end of a tick clears its own emit only [own]', () => {
  it('an emit from a later microtask keeps its base', async () => {
    const t = makeTable({ answer: 'ignore', rowCount: 100 })
    let base: unknown
    // Runs after the first emit, before the microtask that ends its tick:
    // the second emit must survive that reset.
    queueMicrotask(() => {
      // Reads after the first reset, before the second one.
      queueMicrotask(() => {
        base = t.table.getBaseQuery()
      })
      t.table.nextPage()
    })
    t.table.nextPage()
    await tick()
    expect(t.queries()).toEqual([start({ page: 2 }), start({ page: 3 })])
    expect(base).toEqual(start({ page: 3 }))
  })
})

describe('C-59 Controlled row selection [tanstack]', () => {
  it('selection is the consumer state and emits no query', () => {
    const t = makeTable({ selection: { '2': true, '99': true } })
    expect(t.table.getRow('2').getIsSelected()).toBe(true)
    t.table.getRow('1').toggleSelected(true)
    expect(t.selections).toEqual([{ '1': true, '2': true, '99': true }])
    expect(t.table.getRow('1').getIsSelected()).toBe(true)
    expect(t.updates).toEqual([])
  })

  it('an ignored selection change leaves the rows as drawn', () => {
    const t = makeTable({ answer: 'ignore' })
    t.table.getRow('1').toggleSelected(true)
    expect(t.selections).toHaveLength(1)
    expect(t.table.getRow('1').getIsSelected()).toBe(false)
  })
})

describe('C-60 Unknown query keys pass through [own]', () => {
  it('keeps keys and rule properties it does not know through every action', () => {
    const query = {
      ...start({ filters: [{ ...rule('name', 'a'), note: 1 } as FilterRule] }),
      tenant: { id: 7 }
    } as Query
    const t = makeTable({ query, rowCount: 100, answer: 'ignore' })
    t.column('age').toggleQuerySorting()
    t.table.setGlobalFilter('x')
    t.column('age').setFilterValue([rule('age', 1)])
    for (const next of t.queries()) {
      expect((next as unknown as { tenant: unknown }).tenant).toEqual({ id: 7 })
      expect(next.filters[0]).toEqual({ ...rule('name', 'a'), note: 1 })
    }
  })
})
