import type { FilterRule, PageQuery } from '@dolusoft/query-protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeTable, start } from './support/table'

const rule = (
  field: string,
  value: string | number,
  condition: FilterRule['condition'] = 'Contains'
): FilterRule => ({ field, condition, value })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('C-09 Typing applies a filter after the debounce [own]', () => {
  it('several keystrokes make one update, page 1, reason filter', () => {
    const t = makeTable({ query: start({ page: 3 }), rowCount: 100 })
    const name = t.column('name')
    name.setFilterInput('a')
    vi.advanceTimersByTime(50)
    name.setFilterInput('an')
    vi.advanceTimersByTime(99)
    expect(t.updates).toEqual([])
    vi.advanceTimersByTime(1)
    expect(t.updates).toEqual([
      [start({ filters: [rule('name', 'an')] }), 'filter']
    ])
  })

  it('follows filterDebounce', () => {
    const t = makeTable({ filterDebounce: 300 })
    t.column('name').setFilterInput('a')
    vi.advanceTimersByTime(299)
    expect(t.updates).toEqual([])
    vi.advanceTimersByTime(1)
    expect(t.updates).toHaveLength(1)
  })
})

describe('C-11 Emptying an input applies at once [own]', () => {
  it('removes the rules of that column without waiting', () => {
    const t = makeTable({ query: start({ filters: [rule('name', 'a')] }) })
    t.column('name').setFilterInput('  ')
    expect(t.updates).toEqual([[start(), 'filter']])
  })
})

describe('C-12 Enter and zero debounce [own]', () => {
  it('applyFilterInput applies the pending text now', () => {
    const t = makeTable()
    t.column('name').setFilterInput('a')
    t.column('name').applyFilterInput()
    expect(t.updates).toHaveLength(1)
    vi.runAllTimers()
    expect(t.updates).toHaveLength(1)
  })

  it('with filterDebounce 0 every keystroke applies synchronously', () => {
    const t = makeTable({ filterDebounce: 0 })
    t.column('name').setFilterInput('a')
    t.column('name').setFilterInput('ab')
    expect(t.queries().map(query => query.filters)).toEqual([
      [rule('name', 'a')],
      [rule('name', 'ab')]
    ])
  })
})

describe('C-13 flushPendingFilters [own]', () => {
  it('applies every pending input in one update before it returns', () => {
    const t = makeTable()
    t.column('name').setFilterInput('a')
    t.column('age').setFilterInput('5')
    expect(t.table.flushPendingFilters()).toBe(true)
    expect(t.updates).toEqual([
      [
        start({ filters: [rule('name', 'a'), rule('age', 5, 'Equal')] }),
        'filter'
      ]
    ])
    expect(t.table.flushPendingFilters()).toBe(false)
  })

  it('leaves out an input whose text changes no rule', () => {
    const t = makeTable({ query: start({ filters: [rule('name', 'a')] }) })
    t.column('name').setFilterInput('a,')
    expect(t.table.flushPendingFilters()).toBe(false)
    expect(t.updates).toEqual([])
  })
})

describe('C-14 Pending filters go first [own]', () => {
  it('before a sort: a filter update, then the sort built on it', () => {
    const t = makeTable({ answer: 'ignore' })
    t.column('name').setFilterInput('a')
    t.column('age').toggleQuerySorting()
    expect(t.updates).toEqual([
      [start({ filters: [rule('name', 'a')] }), 'filter'],
      [
        start({
          filters: [rule('name', 'a')],
          sort: { field: 'age', direction: 'asc' }
        }),
        'sort'
      ]
    ])
  })

  it('before a page size change and a search', () => {
    const t = makeTable()
    t.column('name').setFilterInput('a')
    t.table.setPageSize(20)
    t.column('name').setFilterInput('b')
    t.table.setGlobalFilter('s')
    expect(t.reasons()).toEqual(['filter', 'pageSize', 'filter', 'search'])
    expect(t.query).toEqual(
      start({ pageSize: 20, filters: [rule('name', 'b')], search: 's' })
    )
  })

  it('drops a page action when the flush changed the filters', () => {
    const t = makeTable({ rowCount: 100 })
    t.column('name').setFilterInput('a')
    t.table.nextPage()
    expect(t.updates).toEqual([
      [start({ filters: [rule('name', 'a')] }), 'filter']
    ])
  })

  it('keeps a page action when the pending text changes no filter', () => {
    const t = makeTable({
      query: start({ filters: [rule('name', 'a')] }),
      rowCount: 100
    })
    t.column('name').setFilterInput('a,')
    t.table.nextPage()
    expect(t.reasons()).toEqual(['page'])
  })
})

describe('C-18 The input follows outside changes [own]', () => {
  it('an echo leaves the typed text as it is', () => {
    const t = makeTable()
    t.column('name').setFilterInput('a,')
    vi.runAllTimers()
    expect(t.query.filters).toEqual([rule('name', 'a')])
    expect(t.column('name').getFilterInput().text).toBe('a,')
  })

  it('a late echo does not overwrite what was typed since', () => {
    const t = makeTable({ answer: 'late' })
    const name = t.column('name')
    name.setFilterInput('a')
    vi.runAllTimers()
    name.setFilterInput('ab')
    vi.runAllTimers()
    name.setFilterInput('abc')
    t.answerLate()
    expect(name.getFilterInput().text).toBe('abc')
  })

  it('answers older than the eight remembered are recognised by order', () => {
    const t = makeTable({ answer: 'late', filterDebounce: 0 })
    const name = t.column('name')
    for (let i = 1; i <= 10; i += 1) {
      name.setFilterInput(`v${i}`)
    }
    name.setFilterInput('typed')
    t.answerLate()
    expect(name.getFilterInput().text).toBe('typed')
  })

  it('an outside change shows the new rules; removing them empties the input', () => {
    const t = makeTable()
    t.column('name').setFilterInput('a')
    vi.runAllTimers()
    t.setQuery(start({ filters: [rule('name', 'x', 'StartsWith')] }))
    expect(t.column('name').getFilterInput()).toEqual({
      text: 'x*',
      condition: null
    })
    t.setQuery(start())
    expect(t.column('name').getFilterInput()).toEqual({
      text: '',
      condition: null
    })
    expect(t.column('name').getFilterLabel()).toBeNull()
  })

  it('shows the rules given at construction', () => {
    const t = makeTable({
      query: start({
        filters: [rule('age', 1, 'Equal'), rule('age', 2, 'Equal')]
      })
    })
    expect(t.column('age').getFilterInput()).toEqual({
      text: '',
      condition: 'Equal',
      multi: 2
    })
    expect(t.column('age').getFilterLabel()).toEqual({
      condition: 'Equal',
      count: 2
    })
  })
})

describe('C-20 Picking a condition [own]', () => {
  it('applies when the input has a value, waits without one', () => {
    const t = makeTable()
    const name = t.column('name')
    name.setFilterCondition('StartsWith')
    expect(t.updates).toEqual([])
    expect(name.getFilterLabel()).toEqual({ condition: 'StartsWith', count: 0 })
    name.setFilterInput('a')
    vi.runAllTimers()
    expect(t.query.filters).toEqual([rule('name', 'a', 'StartsWith')])
    name.setFilterCondition('EndsWith')
    expect(t.query.filters).toEqual([rule('name', 'a', 'EndsWith')])
  })

  it('null clears the filter', () => {
    const t = makeTable({ query: start({ filters: [rule('name', 'a')] }) })
    t.column('name').setFilterCondition(null)
    expect(t.query.filters).toEqual([])
  })

  it('on several rules of a non-text column, keeps the first value', () => {
    const t = makeTable({
      query: start({
        filters: [rule('age', 1, 'Equal'), rule('age', 2, 'Equal')]
      })
    })
    t.column('age').setFilterCondition('GreaterThan')
    expect(t.query.filters).toEqual([rule('age', 1, 'GreaterThan')])
  })
})

describe('C-21 Clearing one column [own]', () => {
  it('removes the rules of that column only, page 1, sort kept', () => {
    const query = start({
      page: 2,
      sort: { field: 'age', direction: 'asc' },
      filters: [rule('name', 'a'), rule('age', 3, 'Equal')]
    })
    const t = makeTable({ query, rowCount: 100 })
    t.column('name').clearFilterInput()
    expect(t.updates).toEqual([
      [
        {
          ...query,
          page: 1,
          filters: [rule('age', 3, 'Equal')]
        } satisfies PageQuery,
        'filter'
      ]
    ])
  })
})

describe('C-22 Clearing all filters [own]', () => {
  it('removes every rule, reason reset, page 1, size and sort kept', () => {
    const query = start({
      page: 2,
      pageSize: 20,
      sort: { field: 'age', direction: 'desc' },
      filters: [rule('name', 'a'), rule('hidden', 'x')]
    })
    const t = makeTable({ query, rowCount: 100 })
    expect(t.table.getCanClearAllFilters()).toBe(true)
    t.table.clearAllFilters()
    expect(t.updates).toEqual([[{ ...query, page: 1, filters: [] }, 'reset']])
    expect(t.table.getCanClearAllFilters()).toBe(false)
  })

  it('discards pending text instead of applying it', () => {
    const t = makeTable()
    t.column('name').setFilterInput('a')
    expect(t.table.getCanClearAllFilters()).toBe(true)
    t.table.clearAllFilters()
    vi.runAllTimers()
    expect(t.updates).toEqual([])
    expect(t.column('name').getFilterInput().text).toBe('')
    expect(t.table.getCanClearAllFilters()).toBe(false)
  })

  it('C-57 in cursor mode starts over at the first cursor', () => {
    const query = {
      cursor: { token: 'n1', direction: 'next' as const },
      pageSize: 10,
      sort: null,
      filters: [rule('name', 'a')]
    }
    const t = makeTable({ query, cursors: { next: 'n2', prev: 'p1' } })
    t.table.clearAllFilters()
    expect(t.updates).toEqual([
      [{ ...query, cursor: null, filters: [] }, 'reset']
    ])
  })

  it('forgets the text of a column that leaves the table', () => {
    const t = makeTable()
    t.column('name').setFilterInput('a')
    t.table.setOptions(old => ({
      ...old,
      columns: old.columns.filter(column => column.id !== 'name')
    }))
    expect(t.table.getCanClearAllFilters()).toBe(false)
    vi.runAllTimers()
    expect(t.updates).toEqual([])
    expect(t.table.store.state.filterDrafts).toEqual({})
  })
})

describe('C-60 extra rule properties count in comparison [own]', () => {
  const noted = (note: number): FilterRule =>
    ({ ...rule('name', 'a'), note }) as FilterRule

  it('setFilterValue with rules that differ only in an extra property emits', () => {
    const t = makeTable({ query: start({ page: 3, filters: [noted(1)] }) })
    t.column('name').setFilterValue([noted(2)])
    expect(t.updates).toEqual([[start({ filters: [noted(2)] }), 'filter']])
  })

  it('setFilterValue with identical rules, extras included, emits nothing', () => {
    const t = makeTable({ query: start({ page: 3, filters: [noted(1)] }) })
    t.column('name').setFilterValue([noted(1)])
    expect(t.updates).toEqual([])
  })

  it('typing the text a rule already holds does not drop its extras', () => {
    const t = makeTable({ query: start({ filters: [noted(1)] }) })
    t.column('name').setFilterInput('a')
    t.column('name').applyFilterInput()
    vi.runAllTimers()
    expect(t.updates).toEqual([])
  })
})
