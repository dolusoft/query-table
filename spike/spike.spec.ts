// The feasibility scenarios of PLAN-v3 A3 (and K6): can a controlled query
// table keep the 2.2 contract on top of TanStack Table v9? Each `describe`
// is one scenario of spike/REPORT.md. The spike is deleted at the end of
// PR-C; these tests are not contract tests (no C-nn in their names).
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'

import type { Column, FilterRule } from '../src/contract'
import type { PageCursors, Reason, SpikeQuery } from './core/query'
import { isTracked } from './core/shared'
import {
  type Selection,
  type SpikeRow,
  SpikeTable,
  type SpikeTableApi
} from './vue/spike-table'

const columns: Column[] = [
  { field: 'name', title: 'Name', width: '120px' },
  { field: 'age', title: 'Age', type: 'number' }
]

const rowsOf = (...ids: number[]): SpikeRow[] =>
  ids.map(id => ({ id, name: `n${id}`, age: id }))

const start = (patch: Partial<SpikeQuery> = {}): SpikeQuery => ({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: [],
  ...patch
})

type Answer = 'apply' | 'ignore' | 'late'

interface Options {
  query?: SpikeQuery
  answer?: Answer
  totalRows?: number
  pagingMode?: 'page' | 'cursor'
  cursors?: PageCursors
  rows?: SpikeRow[]
  selection?: Selection
  selectionAnswer?: 'apply' | 'ignore'
}

/** A consumer around the table, answering its updates as told. */
const mountSpike = (options: Options = {}) => {
  const query = shallowRef(options.query ?? start())
  const selection = shallowRef<Selection>(options.selection ?? {})
  const rows = shallowRef(options.rows ?? rowsOf(1, 2, 3))
  const cursors = shallowRef(options.cursors)
  const widths = ref<Record<string, string>>({})
  const updates: [SpikeQuery, Reason][] = []
  const selections: Selection[] = []
  const resizes: { field: string; width: number }[] = []
  const late: (() => void)[] = []
  const parent = defineComponent({
    setup: () => () =>
      h(SpikeTable, {
        ref: 'table',
        query: query.value,
        rows: rows.value,
        columns: columns.map(column => ({
          ...column,
          width: widths.value[column.field] ?? column.width
        })),
        totalRows: options.totalRows,
        pagingMode: options.pagingMode ?? 'page',
        cursors: cursors.value,
        selection: selection.value,
        'onUpdate:query': (next: SpikeQuery, reason: Reason) => {
          updates.push([next, reason])
          if (options.answer === 'late') {
            late.push(() => (query.value = next))
          } else if (options.answer !== 'ignore') {
            query.value = next
          }
        },
        'onUpdate:selection': (next: Selection) => {
          selections.push(next)
          if (options.selectionAnswer !== 'ignore') {
            selection.value = next
          }
        },
        onColumnResize: (event: { field: string; width: number }) => {
          resizes.push(event)
        }
      })
  })
  const wrapper = mount(parent, { attachTo: document.body })
  const table = (
    wrapper.findComponent(SpikeTable).vm as unknown as { table: SpikeTableApi }
  ).table
  return {
    wrapper,
    table,
    query,
    rows,
    cursors,
    widths,
    updates,
    reasons: () => updates.map(([, reason]) => reason),
    selections,
    resizes,
    /** Applies the updates a late consumer held back, in order. */
    answerLate: () => late.splice(0).forEach(apply => apply()),
    sortButton: (field: string) =>
      wrapper.find(`th[data-field="${field}"] button.sort`)
  }
}

/** Lets the microtask that ends the tick run (and Vue flush). */
const tick = async () => {
  await Promise.resolve()
  await nextTick()
}

describe('scenario 1: echo — answered, ignored, late', () => {
  it('emits nothing on mount and nothing when the query changes from outside', async () => {
    const m = mountSpike()
    m.query.value = start({
      page: 2,
      sort: { field: 'age', direction: 'desc' }
    })
    await tick()
    expect(m.updates).toEqual([])
    expect(m.sortButton('age').attributes('data-sort')).toBe('desc')
  })

  it('answered: one update per click, the table draws the answer', async () => {
    const m = mountSpike()
    await m.sortButton('name').trigger('click')
    await tick()
    expect(m.updates).toEqual([
      [start({ sort: { field: 'name', direction: 'asc' } }), 'sort']
    ])
    expect(m.sortButton('name').attributes('data-sort')).toBe('asc')
    await m.sortButton('name').trigger('click')
    await tick()
    expect(m.updates[1]).toEqual([
      start({ sort: { field: 'name', direction: 'desc' } }),
      'sort'
    ])
  })

  it('ignored: the table keeps drawing the old query, the next action builds on it', async () => {
    const m = mountSpike({ answer: 'ignore' })
    await m.sortButton('name').trigger('click')
    await tick()
    expect(m.sortButton('name').attributes('data-sort')).toBeUndefined()
    await m.sortButton('name').trigger('click')
    await tick()
    // Both clicks start from "no sort": the second is ascending again.
    expect(m.updates.map(([q]) => q.sort)).toEqual([
      { field: 'name', direction: 'asc' },
      { field: 'name', direction: 'asc' }
    ])
  })

  it('late: the answer arrives after the tick; it is drawn and emits nothing', async () => {
    const m = mountSpike({ answer: 'late' })
    await m.sortButton('name').trigger('click')
    await tick()
    expect(m.sortButton('name').attributes('data-sort')).toBeUndefined()
    m.answerLate()
    await tick()
    expect(m.sortButton('name').attributes('data-sort')).toBe('asc')
    expect(m.updates).toHaveLength(1)
  })
})

describe('scenario 2: two pending drafts, then an action', () => {
  const both: FilterRule[] = [
    { field: 'name', condition: 'Contains', value: 'ali' },
    { field: 'age', condition: 'Equal', value: 25 }
  ]

  it('a sort first applies both drafts in one filter update, then sorts on top', async () => {
    const m = mountSpike({ query: start({ page: 3 }), totalRows: 100 })
    m.table.setFilterText('name', 'ali')
    m.table.setFilterText('age', '25')
    await m.sortButton('name').trigger('click')
    expect(m.updates).toEqual([
      [start({ filters: both }), 'filter'],
      [
        start({ filters: both, sort: { field: 'name', direction: 'asc' } }),
        'sort'
      ]
    ])
  })

  it('a page action after drafts that change the filters is dropped: one filter update, page 1', () => {
    const m = mountSpike({ query: start({ page: 3 }), totalRows: 100 })
    m.table.setFilterText('name', 'ali')
    m.table.setFilterText('age', '25')
    m.table.nextPage()
    expect(m.updates).toEqual([[start({ filters: both }), 'filter']])
  })

  it('a draft that changes nothing does not drop the page action', () => {
    const m = mountSpike({
      query: start({ filters: [both[0]] }),
      totalRows: 100
    })
    m.table.setFilterText('name', 'ali')
    m.table.nextPage()
    expect(m.updates).toEqual([
      [start({ filters: [both[0]], page: 2 }), 'page']
    ])
  })
})

describe('scenario 3: page size goes back to page 1', () => {
  it('emits one pageSize update on page 1 (TanStack would keep the top row)', () => {
    const m = mountSpike({ query: start({ page: 3 }), totalRows: 100 })
    m.table.setPageSize(50)
    expect(m.updates).toEqual([[start({ pageSize: 50 }), 'pageSize']])
  })

  it('ignores a size that is not whole; a size below 1 is clamped to 1 by TanStack first', () => {
    const m = mountSpike({ totalRows: 100 })
    m.table.setPageSize(2.5)
    expect(m.updates).toEqual([])
    m.table.setPageSize(0)
    // TanStack turns 0 into 1 before the plugin sees it: the Vue layer has
    // to validate `setPageSize(n)` itself (C-06 ignores values below 1).
    expect(m.updates).toEqual([[start({ pageSize: 1 }), 'pageSize']])
  })

  it('clamps paging to the known total and emits nothing at the ends', () => {
    const m = mountSpike({ query: start({ page: 10 }), totalRows: 100 })
    m.table.nextPage()
    expect(m.updates).toEqual([])
    const first = mountSpike({ totalRows: 100 })
    first.table.previousPage()
    expect(first.updates).toEqual([])
    first.table.setPageIndex(99)
    expect(first.updates).toEqual([[start({ page: 10 }), 'page']])
  })
})

describe('scenario 4: a resize the consumer rejects', () => {
  const drag = async (
    m: ReturnType<typeof mountSpike>,
    from: number,
    to: number
  ) => {
    const header = m.table.getHeaderGroups()[0].headers[0]
    header.getResizeHandler()(new MouseEvent('mousedown', { clientX: from }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: to }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: to }))
    await tick()
  }

  it('emits columnResize on release and keeps no width when the consumer ignores it', async () => {
    const m = mountSpike()
    await drag(m, 100, 150)
    expect(m.resizes).toEqual([{ field: 'name', width: 170 }])
    expect(m.table.getColumn('name')!.getSize()).toBe(120)
    expect(m.updates).toEqual([])
  })

  it('draws the width the consumer writes back', async () => {
    const m = mountSpike()
    await drag(m, 100, 150)
    m.widths.value.name = `${m.resizes[0].width}px`
    await tick()
    expect(m.table.getColumn('name')!.getSize()).toBe(170)
  })
})

describe('scenario 5: two updates in one tick', () => {
  it('a sort and a page step in one tick stack, even when the consumer ignores both', () => {
    for (const answer of ['apply', 'ignore'] as const) {
      const m = mountSpike({ totalRows: 100, answer })
      m.table.getColumn('age')!.toggleSorting(false)
      m.table.nextPage()
      expect(m.updates).toEqual([
        [start({ sort: { field: 'age', direction: 'asc' } }), 'sort'],
        [start({ sort: { field: 'age', direction: 'asc' }, page: 2 }), 'page']
      ])
    }
  })

  it('two page steps in one tick stack', () => {
    const m = mountSpike({ totalRows: 100 })
    m.table.nextPage()
    m.table.nextPage()
    expect(m.updates.map(([q]) => q.page)).toEqual([2, 3])
  })

  it('two header toggles in one tick: TanStack picks the next direction from the drawn state', () => {
    const m = mountSpike()
    m.table.getHeaderGroups()[0].headers[0].column.getToggleSortingHandler()({})
    m.table.getHeaderGroups()[0].headers[0].column.getToggleSortingHandler()({})
    // 2.2 builds the second click on the first (asc, then desc). TanStack's
    // `toggleSorting` reads the next order from the drawn state before the
    // updater runs, so the second toggle asks for asc again and is swallowed.
    expect(m.updates.map(([q]) => q.sort)).toEqual([
      { field: 'name', direction: 'asc' }
    ])
  })

  it('after the tick the base is the answered query again', async () => {
    const m = mountSpike({ totalRows: 100, answer: 'ignore' })
    m.table.nextPage()
    expect(m.table.getBaseQuery().page).toBe(2)
    await tick()
    expect(m.table.getBaseQuery().page).toBe(1)
  })
})

describe('scenario 6 (K6): cursor paging with an unknown total', () => {
  it('follows the cursors the server gave, next and previous', async () => {
    const m = mountSpike({
      pagingMode: 'cursor',
      cursors: { next: 'c2', prev: null }
    })
    expect(m.table.getCanPreviousPage()).toBe(false)
    expect(m.table.getCanNextPage()).toBe(true)
    await m.wrapper.find('button.next').trigger('click')
    expect(m.updates).toEqual([
      [start({ cursor: { token: 'c2', direction: 'next' } }), 'page']
    ])
    m.cursors.value = { next: 'c3', prev: 'c1' }
    await tick()
    expect(m.table.getCanPreviousPage()).toBe(true)
    await m.wrapper.find('button.prev').trigger('click')
    expect(m.updates[1]).toEqual([
      start({ cursor: { token: 'c1', direction: 'prev' } }),
      'page'
    ])
  })

  it('stops at the last page: no next cursor, nothing emitted', async () => {
    const m = mountSpike({
      pagingMode: 'cursor',
      cursors: { next: null, prev: 'c1' }
    })
    expect(m.table.getCanNextPage()).toBe(false)
    expect(m.wrapper.find('button.next').attributes('disabled')).toBeDefined()
    m.table.nextPage()
    await tick()
    expect(m.updates).toEqual([])
  })

  it('a filter, a sort or a page size starts over at the first cursor', () => {
    const m = mountSpike({
      query: start({ cursor: { token: 'c2', direction: 'next' } }),
      pagingMode: 'cursor',
      cursors: { next: 'c3', prev: 'c1' }
    })
    m.table.setFilterText('name', 'ali')
    m.table.flushPendingFilters()
    m.table.getColumn('age')!.toggleSorting(true)
    m.table.setPageSize(25)
    expect(m.updates.map(([q, reason]) => [reason, q.cursor])).toEqual([
      ['filter', null],
      ['sort', null],
      ['pageSize', null]
    ])
  })

  it('page mode with an unknown total: next is always possible', () => {
    const m = mountSpike({ query: start({ page: 4 }) })
    expect(m.table.getPageCount()).toBe(-1)
    expect(m.table.getCanNextPage()).toBe(true)
    m.table.nextPage()
    expect(m.updates).toEqual([[start({ page: 5 }), 'page']])
  })
})

describe('scenario 7 (K6): controlled row selection', () => {
  it('a checkbox emits update:selection; ignored, the row stays unselected', async () => {
    const m = mountSpike({ selectionAnswer: 'ignore' })
    await m.wrapper.find('tr[data-key="2"] input').setValue(true)
    await tick()
    expect(m.selections).toEqual([{ 2: true }])
    expect(
      m.wrapper.find('tr[data-key="2"]').attributes('data-selected')
    ).toBeUndefined()
    expect(m.updates).toEqual([])
  })

  it('applied, the row is selected; select-all keeps keys of other pages', async () => {
    const m = mountSpike({ selection: { 9: true } })
    await m.wrapper.find('tr[data-key="2"] input').setValue(true)
    await tick()
    expect(m.wrapper.find('tr[data-key="2"]').attributes('data-selected')).toBe(
      'true'
    )
    m.table.toggleAllPageRowsSelected(true)
    await tick()
    expect(m.selections.at(-1)).toEqual({ 1: true, 2: true, 3: true, 9: true })
    expect(m.table.getIsAllPageRowsSelected()).toBe(true)
  })

  it('selection follows row keys when the rows change (another page)', async () => {
    const m = mountSpike({ selection: { 2: true, 5: true } })
    m.rows.value = rowsOf(4, 5, 6)
    await tick()
    expect(m.wrapper.find('tr[data-key="5"]').attributes('data-selected')).toBe(
      'true'
    )
    expect(
      m.wrapper.find('tr[data-key="4"]').attributes('data-selected')
    ).toBeUndefined()
    expect(m.selections).toEqual([])
  })
})

describe('isolation and dispose', () => {
  it('two tables share nothing; unmounting disposes the plugin state', async () => {
    const a = mountSpike()
    const b = mountSpike()
    a.table.nextPage()
    expect(a.updates).toHaveLength(1)
    expect(b.updates).toEqual([])
    expect(isTracked(a.table)).toBe(true)
    a.wrapper.unmount()
    await tick()
    expect(isTracked(a.table)).toBe(false)
    expect(isTracked(b.table)).toBe(true)
    b.wrapper.unmount()
  })
})
