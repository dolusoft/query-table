import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  deepFreeze,
  flush,
  makeColumns,
  makeQuery,
  makeRows,
  mountTable,
  reasons,
  type Mounted
} from '../../support/mount-table'

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
  vi.useRealTimers()
})

describe('C-01 The table is controlled', () => {
  it('draws the query it is given and emits nothing when it changes from outside', async () => {
    const m = mountIt({ sortable: true, filterable: true })
    await m.setQuery(
      makeQuery({
        page: 3,
        sort: { field: 'name', direction: 'desc' },
        filters: [{ field: 'name', condition: 'Contains', value: 'bob' }]
      })
    )
    await flush()
    expect(m.events).toEqual([])
    expect(
      m.wrapper.find('th[data-field="name"]').attributes('data-sort')
    ).toBe('desc')
    expect(
      m.wrapper.find('th[data-field="name"]').attributes('data-filtered')
    ).toBe('')
  })

  it('draws an out-of-range page and an unknown field as given', async () => {
    const m = mountIt({
      sortable: true,
      totalRows: 5,
      query: makeQuery({
        page: 99,
        sort: { field: 'ghost', direction: 'asc' },
        filters: [{ field: 'ghost', condition: 'Equal', value: 1 }]
      })
    })
    await flush()
    expect(m.events).toEqual([])
    expect(m.wrapper.find('.page-state').text()).toBe('99/1')
    expect(m.wrapper.find('[data-sort]').exists()).toBe(false)
  })
})

describe('C-02 Quiet by default', () => {
  it('emits nothing on mount', async () => {
    const m = mountIt({ sortable: true, filterable: true })
    await flush()
    expect(m.events).toEqual([])
  })

  it('emits nothing when rows, totalRows or columns change', async () => {
    const m = mountIt({ query: makeQuery({ page: 2 }), totalRows: 50 })
    await m.wrapper.setProps({ rows: makeRows().slice(0, 2) })
    await m.wrapper.setProps({ totalRows: 3 })
    await m.wrapper.setProps({ columns: makeColumns().slice(0, 2) })
    await flush()
    expect(m.events).toEqual([])
    expect(m.query().page).toBe(2)
  })
})

describe('C-03 Inputs are never mutated', () => {
  it('works on frozen props and writes nothing into them', async () => {
    vi.useFakeTimers()
    const query = deepFreeze(
      makeQuery({
        page: 2,
        sort: { field: 'name', direction: 'asc' },
        filters: [{ field: 'age', condition: 'Equal', value: 25 }]
      })
    )
    const columns = deepFreeze(makeColumns())
    const rows = deepFreeze(makeRows())
    const before = structuredClone({ query, columns, rows })
    const m = mountIt(
      { query, columns, rows, totalRows: 50, sortable: true, filterable: true },
      { apply: false }
    )

    await m.wrapper.find('th[data-field="name"] .qt-sort').trigger('click')
    await m.wrapper.find('th[data-field="name"] input').setValue('bo')
    vi.advanceTimersByTime(200)
    await m.wrapper.find('.next-page').trigger('click')

    expect(m.events.length).toBeGreaterThan(0)
    expect({ query, columns, rows }).toEqual(before)
  })

  it('emits a query that shares nothing with the prop', async () => {
    const query = makeQuery({
      filters: [{ field: 'age', condition: 'Equal', value: 25 }]
    })
    const m = mountIt({ query, sortable: true }, { apply: false })
    await m.wrapper.find('th[data-field="name"] .qt-sort').trigger('click')
    const [emitted] = m.events[0]
    expect(emitted).not.toBe(query)
    expect(emitted.filters).not.toBe(query.filters)
    expect(emitted.filters[0]).not.toBe(query.filters[0])
    expect(emitted.filters).toEqual(query.filters)
  })

  it('emits plain data: every query survives a JSON round trip unchanged', async () => {
    vi.useFakeTimers()
    const m = mountIt({
      sortable: true,
      filterable: true,
      columns: [
        ...makeColumns(),
        { field: 'active', title: 'Active', type: 'bool' }
      ]
    })
    await m.wrapper.find('th[data-field="name"] .qt-sort').trigger('click')
    await m.wrapper.find('th[data-field="name"] input').setValue('*bo*,al')
    await m.wrapper.find('th[data-field="age"] input').setValue('25')
    await m.wrapper.find('th[data-field="active"] select').setValue('true')
    vi.advanceTimersByTime(200)
    await m.wrapper.find('.next-page').trigger('click')
    expect(m.events.length).toBeGreaterThan(3)
    for (const [query] of m.events) {
      expect(JSON.parse(JSON.stringify(query))).toStrictEqual(query)
    }
  })
})

describe('C-04 One action, one update', () => {
  it('emits nothing for an action that changes nothing', async () => {
    const m = mountIt({
      sortable: true,
      query: makeQuery({ sort: { field: 'name', direction: 'asc' } })
    })
    // the page size select re-picks the current size
    await m.wrapper.find('.page-size').setValue('10')
    await m.wrapper.find('.previous-page').trigger('click')
    expect(m.events).toEqual([])
  })

  it('makes one update for one click', async () => {
    const m = mountIt({ sortable: true })
    await m.wrapper.find('th[data-field="name"] .qt-sort').trigger('click')
    expect(reasons(m.events)).toEqual(['sort'])
  })

  it('treats a retyped value that parses to the same rules as no change', async () => {
    vi.useFakeTimers()
    const m = mountIt({ filterable: true, filterDebounce: 0 })
    const input = m.wrapper.find('th[data-field="name"] input')
    await input.setValue('foo')
    await input.setValue('foo,')
    expect(reasons(m.events)).toEqual(['filter'])
  })
})

describe('C-19 An ignored update changes nothing', () => {
  it('keeps drawing the old query and keeps the typed text', async () => {
    vi.useFakeTimers()
    const m = mountIt({ filterable: true, sortable: true }, { apply: false })
    const input = m.wrapper.find('th[data-field="name"] input')
    await input.setValue('ali')
    vi.advanceTimersByTime(200)
    await flush()
    expect(reasons(m.events)).toEqual(['filter'])
    expect((input.element as HTMLInputElement).value).toBe('ali')
    expect(
      m.wrapper.find('th[data-field="name"]').attributes('data-filtered')
    ).toBe(undefined)
  })
})

describe('C-33 Exposed surface', () => {
  it('exposes collapseAll, expandAll, focusFilter and flushPendingFilters', () => {
    const m = mountIt()
    // `exposed` is what a template ref sees through the proxy.
    const exposed = (
      m.wrapper.vm.$ as unknown as { exposed: Record<string, unknown> }
    ).exposed
    expect(Object.keys(exposed)).toEqual(
      expect.arrayContaining([
        'collapseAll',
        'expandAll',
        'flushPendingFilters',
        'focusFilter'
      ])
    )
    for (const member of Object.values(exposed)) {
      expect(typeof member).toBe('function')
    }
  })

  // 3.2 (C-87, C-89): not in a 3.1 baseline (`ADDED_AFTER_BASELINE`).
  it('C-87 C-89 exposes scrollToIndex and loadMore too, and nothing else', () => {
    const m = mountIt()
    const exposed = (
      m.wrapper.vm.$ as unknown as { exposed: Record<string, unknown> }
    ).exposed
    expect(Object.keys(exposed).sort()).toEqual([
      'collapseAll',
      'expandAll',
      'flushPendingFilters',
      'focusFilter',
      'loadMore',
      'scrollToIndex'
    ])
  })

  it('emits nothing from collapseAll, expandAll and focusFilter', () => {
    const m = mountIt({ hasSubtable: true, rowKey: 'id', filterable: true })
    const vm = m.wrapper.vm as unknown as {
      collapseAll(): void
      expandAll(): void
      focusFilter(field: string): boolean
    }
    vm.expandAll()
    vm.collapseAll()
    vm.focusFilter('name')
    expect(m.events).toEqual([])
  })
})
