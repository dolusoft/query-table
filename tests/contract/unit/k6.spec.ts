import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, h, nextTick } from 'vue'

import {
  type CursorQuery,
  type PaginationSlotProps,
  type ToolbarSlotProps,
  useQueryTable
} from '@dolusoft/query-table'

import {
  flush,
  makeColumns,
  makeQuery,
  makeRows,
  mountTable,
  reasons,
  type Mounted
} from '../../support/mount-table'

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
  vi.useRealTimers()
})

/** Mounts a table whose toolbar and pagination slots hand their props out. */
const mountK6 = (props: Record<string, unknown> = {}) => {
  const box: {
    toolbar: ToolbarSlotProps | null
    pagination: PaginationSlotProps | null
  } = { toolbar: null, pagination: null }
  mounted = mountTable(props, {
    slots: {
      toolbar: (slot: ToolbarSlotProps) => {
        box.toolbar = slot
        return h('i')
      },
      pagination: (slot: PaginationSlotProps) => {
        box.pagination = slot
        return h('i')
      }
    }
  })
  return { m: mounted, box }
}

describe('C-63 Typed search is debounced [own]', () => {
  it('applies the text once after the debounce, as one search update', async () => {
    vi.useFakeTimers()
    const { m, box } = mountK6({ searchDebounce: 200 })
    box.toolbar!.setSearch('a')
    box.toolbar!.setSearch('al')
    await nextTick()
    expect(box.toolbar!.search).toBe('al')
    expect(m.events).toEqual([])
    vi.advanceTimersByTime(200)
    expect(m.events).toEqual([[makeQuery({ search: 'al' }), 'search']])
    await flush()
    expect(box.toolbar!.search).toBe('al')
  })

  it('applies at once with a debounce of 0, and blank text at once', async () => {
    const { m, box } = mountK6({
      searchDebounce: 0,
      query: makeQuery({ page: 2 })
    })
    box.toolbar!.setSearch('bob')
    await flush()
    box.toolbar!.setSearch('')
    expect(reasons(m.events)).toEqual(['search', 'search'])
    expect(m.events[0][0]).toEqual(makeQuery({ search: 'bob' }))
    expect(m.events[1][0]).toEqual(makeQuery())
  })

  it('applySearch applies a pending text now; nothing pending does nothing', async () => {
    const { m, box } = mountK6()
    box.toolbar!.applySearch()
    box.toolbar!.setSearch('eve')
    box.toolbar!.applySearch()
    expect(m.events).toEqual([[makeQuery({ search: 'eve' }), 'search']])
    await flush()
    box.toolbar!.applySearch()
    expect(m.events).toHaveLength(1)
  })

  it('a pending search goes first and drops the page action', () => {
    const { m, box } = mountK6({ totalRows: 50 })
    box.toolbar!.setSearch('x')
    box.pagination!.nextPage()
    expect(m.events).toEqual([[makeQuery({ search: 'x' }), 'search']])
  })

  it('shows the query search when nothing is typed', async () => {
    const { m, box } = mountK6({ query: makeQuery({ search: 'given' }) })
    expect(box.toolbar!.search).toBe('given')
    await m.setQuery(makeQuery({ search: 'other' }))
    expect(box.toolbar!.search).toBe('other')
  })
})

describe('C-64 Selection column [tanstack] [own]', () => {
  it('draws no column and emits nothing without `selection`', () => {
    const { m } = mountK6()
    expect(m.wrapper.find('.qt-select-row').exists()).toBe(false)
    expect(m.wrapper.find('.qt-select-all').exists()).toBe(false)
  })

  it('toggles a row and emits the new map, keyed by rowKey', async () => {
    const { m } = mountK6({ selection: { '2': true }, rowKey: 'id' })
    const boxes = m.wrapper.findAll('.qt-select-row')
    expect(boxes).toHaveLength(5)
    expect(
      m.wrapper.findAll('tbody tr').map(tr => tr.attributes('data-selected'))
    ).toEqual([undefined, '', undefined, undefined, undefined])
    await boxes[0].setValue(true)
    expect(m.wrapper.emitted('update:selection')).toEqual([
      [{ '1': true, '2': true }]
    ])
    // Controlled: nothing changes until the consumer passes it back.
    expect(m.wrapper.findAll('tbody tr')[0].attributes('data-selected')).toBe(
      undefined
    )
  })

  it('the header checkbox selects the page and keeps other keys', async () => {
    const { m } = mountK6({ selection: { '99': true }, rowKey: 'id' })
    const all = m.wrapper.find<HTMLInputElement>('.qt-select-all')
    expect(all.element.checked).toBe(false)
    await all.setValue(true)
    expect(m.wrapper.emitted('update:selection')?.[0]).toEqual([
      { '99': true, '1': true, '2': true, '3': true, '4': true, '5': true }
    ])
    await m.wrapper.setProps({
      selection: { '1': true, '2': true, '3': true, '4': true, '5': true }
    })
    expect(all.element.checked).toBe(true)
    await m.wrapper.setProps({ selection: { '1': true } })
    expect(all.element.indeterminate).toBe(true)
    // Unchecked already: `setValue(false)` would not fire `change`.
    all.element.checked = false
    await all.trigger('change')
    expect(m.wrapper.emitted('update:selection')?.[1]).toEqual([{}])
  })

  it('keys rows by index without rowKey', async () => {
    const { m } = mountK6({ selection: {} })
    await m.wrapper.findAll('.qt-select-row')[2].setValue(true)
    expect(m.wrapper.emitted('update:selection')).toEqual([[{ '2': true }]])
  })
})

const cursorQuery = (overrides: Partial<CursorQuery> = {}): CursorQuery => ({
  pageSize: 10,
  sort: null,
  filters: [],
  cursor: null,
  ...overrides
})

describe('C-65 Cursor paging controls [tanstack] [own]', () => {
  it('passes cursor mode to the pagination slot', () => {
    const { box } = mountK6({
      query: cursorQuery(),
      totalRows: null,
      cursors: { next: 'n1', prev: null }
    })
    expect(box.pagination).toMatchObject({
      cursorMode: true,
      page: 1,
      pageCount: null,
      canPrevious: false,
      canNext: true
    })
  })

  it('steps with the cursor of each side, and not without one', async () => {
    const { m, box } = mountK6({
      query: cursorQuery(),
      totalRows: null,
      cursors: { next: 'n1', prev: null }
    })
    box.pagination!.previousPage()
    box.pagination!.setPage(3)
    expect(m.events).toEqual([])
    box.pagination!.nextPage()
    expect(m.events).toEqual([
      [cursorQuery({ cursor: { token: 'n1', direction: 'next' } }), 'page']
    ])
    await m.wrapper.setProps({ cursors: { next: null, prev: 'p1' } })
    await flush()
    box.pagination!.nextPage()
    box.pagination!.previousPage()
    expect(m.events[1]).toEqual([
      cursorQuery({ cursor: { token: 'p1', direction: 'prev' } }),
      'page'
    ])
    expect(m.events).toHaveLength(2)
  })

  it('a page size goes back to the first page', () => {
    const { m, box } = mountK6({
      query: cursorQuery({ cursor: { token: 'n1', direction: 'next' } }),
      totalRows: null,
      cursors: { next: 'n2', prev: 'p0' }
    })
    box.pagination!.setPageSize(20)
    expect(m.events).toEqual([
      [cursorQuery({ pageSize: 20, cursor: null }), 'pageSize']
    ])
  })
})

describe('C-62 Dispose and isolation [own]', () => {
  it('useQueryTable stops emitting once its scope is disposed', () => {
    vi.useFakeTimers()
    const emitted: unknown[] = []
    const scope = effectScope()
    const state = scope.run(() =>
      useQueryTable({
        query: makeQuery(),
        columns: makeColumns(),
        rows: makeRows(),
        totalRows: 50,
        onQueryChange: query => emitted.push(query)
      })
    )!
    state.filters.setInput('name', 'al')
    state.search.set('bob')
    scope.stop()
    vi.advanceTimersByTime(1000)
    state.pagination.value.nextPage()
    expect(emitted).toEqual([])
  })
})
