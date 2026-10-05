import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'

import { makeColumns, makeQuery } from '../../tests/support/mount-table'
import type { Column, QueryChangeReason, TableQuery } from '../contract'
import { type FilterDrafts, useFilterDrafts } from './use-filter-drafts'

interface SetupOptions {
  debounce?: number
  /** `false`: the consumer ignores every update (the query stays). */
  apply?: boolean
  query?: TableQuery
  columns?: Column[]
}

const scopes: EffectScope[] = []

// The composable runs in a bare effect scope, without a component: the
// consumer is a few lines that either take the emitted query or ignore it.
const setup = (options: SetupOptions = {}) => {
  const query = ref(options.query ?? makeQuery())
  const columns = ref(options.columns ?? makeColumns())
  const updates: Array<{ query: TableQuery; reason: QueryChangeReason }> = []
  const scope = effectScope()
  scopes.push(scope)
  const drafts = scope.run(() =>
    useFilterDrafts({
      query: () => query.value,
      base: () => query.value,
      columns: () => columns.value,
      debounce: () => options.debounce ?? 100,
      update: (next, reason) => {
        updates.push({ query: next, reason })
        if (options.apply !== false) {
          query.value = next
        }
      }
    })
  ) as FilterDrafts
  return { drafts, query, columns, updates }
}

afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop())
  vi.useRealTimers()
})

describe('C-09 Typing applies a filter after the debounce', () => {
  it('applies after the wait with reason filter, on page 1', () => {
    vi.useFakeTimers()
    const { drafts, updates } = setup({ query: makeQuery({ page: 4 }) })
    drafts.onInput('name', 'bob')
    expect(updates).toEqual([])
    vi.advanceTimersByTime(99)
    expect(updates).toEqual([])
    vi.advanceTimersByTime(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].reason).toBe('filter')
    expect(updates[0].query.page).toBe(1)
    expect(updates[0].query.filters).toEqual([
      { field: 'name', condition: 'Contains', value: 'bob' }
    ])
  })

  it('makes one update for several keystrokes', () => {
    vi.useFakeTimers()
    const { drafts, updates } = setup()
    drafts.onInput('name', 'b')
    vi.advanceTimersByTime(60)
    drafts.onInput('name', 'bo')
    vi.advanceTimersByTime(60)
    drafts.onInput('name', 'bob')
    vi.advanceTimersByTime(100)
    expect(updates).toHaveLength(1)
    expect(updates[0].query.filters[0].value).toBe('bob')
  })
})

describe('C-10 Other rules pass through', () => {
  it('replaces the rules of one column and keeps the rest', () => {
    const { drafts, updates } = setup({
      debounce: 0,
      query: makeQuery({
        filters: [
          { field: 'age', condition: 'Equal', value: 25 },
          { field: 'ghost', condition: 'Equal', value: 1 },
          { field: 'name', condition: 'Contains', value: 'old' }
        ]
      })
    })
    drafts.onInput('name', 'new')
    expect(updates[0].query.filters).toEqual([
      { field: 'age', condition: 'Equal', value: 25 },
      { field: 'ghost', condition: 'Equal', value: 1 },
      { field: 'name', condition: 'Contains', value: 'new' }
    ])
  })
})

describe('C-11 Emptying an input applies at once', () => {
  it('removes the rules of the column without waiting', () => {
    vi.useFakeTimers()
    const { drafts, updates } = setup({
      query: makeQuery({
        filters: [{ field: 'name', condition: 'Contains', value: 'bob' }]
      })
    })
    drafts.onInput('name', '')
    expect(updates).toHaveLength(1)
    expect(updates[0].query.filters).toEqual([])
  })
})

describe('C-12 Enter and zero debounce', () => {
  it('applies every keystroke at once with a debounce of 0', () => {
    const { drafts, updates } = setup({ debounce: 0 })
    drafts.onInput('name', 'a')
    drafts.onInput('name', 'ab')
    expect(updates).toHaveLength(2)
  })

  it('flushField applies the pending text now, and only that field', () => {
    vi.useFakeTimers()
    const { drafts, updates } = setup()
    drafts.onInput('name', 'bob')
    drafts.onInput('age', '25')
    drafts.flushField('name')
    expect(updates).toHaveLength(1)
    expect(updates[0].query.filters[0].field).toBe('name')
    vi.advanceTimersByTime(100)
    expect(updates).toHaveLength(2)
  })
})

describe('C-13 flushPendingFilters', () => {
  it('flushAll applies every pending draft and says whether filters changed', () => {
    vi.useFakeTimers()
    const { drafts, updates } = setup()
    drafts.onInput('name', 'bob')
    drafts.onInput('age', '25')
    expect(drafts.flushAll()).toBe(true)
    expect(updates).toHaveLength(2)
    vi.advanceTimersByTime(500)
    expect(updates).toHaveLength(2)
  })

  it('flushAll reports false when nothing is pending or nothing changes', () => {
    vi.useFakeTimers()
    const { drafts, updates } = setup()
    expect(drafts.flushAll()).toBe(false)
    drafts.onInput('name', '   ')
    expect(drafts.flushAll()).toBe(false)
    expect(updates).toEqual([])
  })
})

describe('C-18 The input follows outside changes', () => {
  it('shows rules that arrive from outside, and empties when they go', async () => {
    const { drafts, query } = setup()
    query.value = makeQuery({
      filters: [{ field: 'name', condition: 'StartsWith', value: 'zed' }]
    })
    await nextTick()
    expect(drafts.draftOf('name')).toEqual({ text: 'zed*', condition: null })
    expect(drafts.label(makeColumns()[1])).toEqual({
      condition: 'StartsWith',
      count: 1
    })

    query.value = makeQuery()
    await nextTick()
    expect(drafts.draftOf('name')).toEqual({ text: '', condition: null })
    expect(drafts.label(makeColumns()[1])).toBeNull()
  })

  it('leaves the typed text alone when its own emit comes back', async () => {
    const { drafts, updates } = setup({ debounce: 0 })
    drafts.onInput('name', '*bob*')
    await nextTick()
    expect(updates).toHaveLength(1)
    expect(drafts.draftOf('name').text).toBe('*bob*')
  })

  it('leaves it alone when the consumer answers late, in order', async () => {
    const { drafts, query, updates } = setup({ debounce: 0, apply: false })
    drafts.onInput('name', 'a')
    drafts.onInput('name', 'ab')
    query.value = updates[0].query
    await nextTick()
    expect(drafts.draftOf('name').text).toBe('ab')
    query.value = updates[1].query
    await nextTick()
    expect(drafts.draftOf('name').text).toBe('ab')
  })

  it('counts the rules a non-text input cannot write, and stays read-only', async () => {
    const { drafts, query } = setup()
    query.value = makeQuery({
      filters: [
        { field: 'age', condition: 'Equal', value: 25 },
        { field: 'age', condition: 'Equal', value: 30 }
      ]
    })
    await nextTick()
    expect(drafts.multiOf('age')).toBe(2)
    expect(drafts.label(makeColumns()[2])).toEqual({
      condition: 'Equal',
      count: 2
    })
    drafts.onInput('age', '31')
    expect(drafts.multiOf('age')).toBe(0)
  })
})

describe('C-19 An ignored update changes nothing', () => {
  it('keeps the typed text when the query does not change', async () => {
    const { drafts, updates } = setup({ debounce: 0, apply: false })
    drafts.onInput('name', 'bob')
    await nextTick()
    expect(updates).toHaveLength(1)
    expect(drafts.draftOf('name').text).toBe('bob')
    expect(drafts.dirty()).toBe(true)
  })
})

describe('C-20 Picking a condition', () => {
  it('waits for a value when there is none, and emits nothing', () => {
    const { drafts, updates } = setup()
    drafts.setCondition('name', 'StartsWith')
    expect(updates).toEqual([])
    expect(drafts.draftOf('name').condition).toBe('StartsWith')
    expect(drafts.dirty()).toBe(true)
  })

  it('applies with the value once there is one', () => {
    const { drafts, updates } = setup({ debounce: 0 })
    drafts.onInput('name', 'bo')
    drafts.setCondition('name', 'EndsWith')
    expect(updates.at(-1)?.query.filters).toEqual([
      { field: 'name', condition: 'EndsWith', value: 'bo' }
    ])
  })

  it('null clears the filter', () => {
    const { drafts, updates } = setup({
      query: makeQuery({
        filters: [{ field: 'name', condition: 'Contains', value: 'bob' }]
      })
    })
    drafts.setCondition('name', null)
    expect(updates.at(-1)?.query.filters).toEqual([])
  })
})

describe('C-21 Clearing one column', () => {
  it('removes the rules of that column only, on page 1', () => {
    const { drafts, updates } = setup({
      query: makeQuery({
        page: 3,
        sort: { field: 'name', direction: 'asc' },
        filters: [
          { field: 'name', condition: 'Contains', value: 'bob' },
          { field: 'age', condition: 'Equal', value: 25 }
        ]
      })
    })
    drafts.clear('name')
    expect(updates).toHaveLength(1)
    expect(updates[0].reason).toBe('filter')
    expect(updates[0].query.page).toBe(1)
    expect(updates[0].query.sort).toEqual({ field: 'name', direction: 'asc' })
    expect(updates[0].query.filters).toEqual([
      { field: 'age', condition: 'Equal', value: 25 }
    ])
  })
})

describe('C-22 Clearing all filters', () => {
  it('removes every rule with reason reset and keeps the rest of the query', () => {
    const { drafts, updates } = setup({
      query: makeQuery({
        page: 3,
        pageSize: 25,
        sort: { field: 'name', direction: 'desc' },
        filters: [{ field: 'name', condition: 'Contains', value: 'bob' }]
      })
    })
    drafts.clearAll()
    expect(updates).toHaveLength(1)
    expect(updates[0].reason).toBe('reset')
    expect(updates[0].query).toEqual({
      page: 1,
      pageSize: 25,
      sort: { field: 'name', direction: 'desc' },
      filters: []
    })
  })

  it('discards what is pending instead of applying it', () => {
    vi.useFakeTimers()
    const { drafts, updates } = setup()
    drafts.onInput('name', 'bob')
    drafts.clearAll()
    vi.advanceTimersByTime(500)
    expect(updates).toEqual([])
    expect(drafts.dirty()).toBe(false)
  })
})

describe('useFilterDrafts scope', () => {
  it('drops its timers when the scope stops', () => {
    vi.useFakeTimers()
    const { drafts, updates } = setup()
    drafts.onInput('name', 'bob')
    scopes.splice(0).forEach(scope => scope.stop())
    vi.advanceTimersByTime(500)
    expect(updates).toEqual([])
  })

  it('ignores a draft whose column is gone', () => {
    const { drafts, updates, columns } = setup({ debounce: 0 })
    columns.value = columns.value.filter(column => column.field !== 'name')
    drafts.onInput('name', 'bob')
    expect(updates).toEqual([])
  })
})
