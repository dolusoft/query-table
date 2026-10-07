import * as rowChanges from '@dolusoft/query-table-core/row-changes'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSSRApp,
  defineComponent,
  h,
  KeepAlive,
  nextTick,
  shallowRef,
  type Component,
  type VNode
} from 'vue'
import { renderToString } from 'vue/server-renderer'

import QueryTable, { type RowsUpdate } from '@dolusoft/query-table'

import { liveUpdateDom } from '../../support/live-update-dom'
import {
  makeColumns,
  makeQuery,
  makeRows,
  mountTable,
  propsOf,
  type Mounted,
  type Row
} from '../../support/mount-table'

// The change flash without layout (C-93 to C-95): what is marked, when it
// ends, the binding of the elapsed time, the lifecycle, and that a table
// without `flash` does no work for it. The CSS animations, the skin and the
// virtual window need a browser: flash.browser.spec.ts. 3.3 additions: not
// in a 3.2 baseline (`ADDED_AFTER_BASELINE`).

vi.mock('@dolusoft/query-table-core/row-changes', async original => {
  const actual = await original<typeof rowChanges>()
  return {
    ...actual,
    createRowChangeTracker: vi.fn(actual.createRowChangeTracker)
  }
})

let mounted: Mounted | null = null
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance'
    ]
  })
})
afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.mocked(rowChanges.createRowChangeTracker).mockClear()
})

const DURATION = 500

/** A parent that draws what draw returns, re-rendering when it changes. */
const Host = defineComponent({
  props: { draw: { type: Function, required: true } },
  setup: props => () => (props.draw as () => VNode)()
})
const mountHost = (draw: () => VNode) =>
  mount(Host, { props: { draw }, attachTo: document.body })

const mountFlash = (props: Record<string, unknown> = {}) => {
  mounted = mountTable({
    flash: true,
    rowKey: 'id',
    style: `--qt-flash-duration: ${DURATION}ms`,
    ...props
  })
  return mounted
}

/** Every mark in the body, as `tr:<index>=<phase>` or `td:<index>/<field>=<phase>`. */
const marks = (m: Mounted) =>
  m.wrapper.findAll('tbody [data-flash]').map(found => {
    const el = found.element as HTMLElement
    const tr = el.closest('tr')!
    const place =
      el.tagName === 'TR'
        ? `tr:${tr.dataset.rowIndex}`
        : `td:${tr.dataset.rowIndex}/${el.dataset.field}`
    return `${place}=${el.dataset.flash}`
  })

const setRows = async (m: Mounted, rows: Row[], extra = {}) => {
  await m.wrapper.setProps({ rows, ...extra })
}

/** The rows with the row of `id` changed by `patch` (a new object). */
const withRow = (rows: Row[], id: number, patch: Partial<Row>) =>
  rows.map(row => (row.id === id ? { ...row, ...patch } : row))

const rowsOf = (m: Mounted) => propsOf(m).rows as Row[]

/** Let the clock run: timers, frames and then the render they cause. */
const elapse = async (ms: number) => {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

const elapsedOf = (el: Element) =>
  (el as HTMLElement).style.getPropertyValue('--qt-flash-elapsed')

describe('C-93 Change flash: what flashes [own]', () => {
  it('marks nothing on the first rows', () => {
    const m = mountFlash()
    expect(marks(m)).toEqual([])
  })

  it('flashes a changed cell and a new row, nothing else', async () => {
    const m = mountFlash()
    await setRows(m, [
      ...withRow(rowsOf(m), 2, { age: 26 }),
      { id: 6, name: 'Fay', age: 22, joined: '2024-06-01' }
    ])
    expect(marks(m)).toEqual(['td:1/age=a', 'tr:5=a'])
  })

  it('keeps the running flashes when the next page of an infinite list comes tagged append', async () => {
    const m = mountFlash({ rowsUpdate: 'live' })
    await setRows(m, withRow(rowsOf(m), 2, { age: 26 }))
    expect(marks(m)).toEqual(['td:1/age=a'])
    // The list asks for page 2: the query changes, the rows do not yet.
    await m.wrapper.setProps({ query: { ...makeQuery(), page: 2 } })
    expect(marks(m)).toEqual(['td:1/age=a'])
    // The page arrives, appended: the flash runs on, the new rows are quiet.
    await setRows(
      m,
      [...rowsOf(m), { id: 6, name: 'Fay', age: 22, joined: '2024-06-01' }],
      { rowsUpdate: 'append' }
    )
    expect(marks(m)).toEqual(['td:1/age=a'])
    m.wrapper.unmount()
    // Without a hint a query change still clears every flash.
    const plain = mountFlash()
    await setRows(plain, withRow(rowsOf(plain), 2, { age: 26 }))
    await plain.wrapper.setProps({ query: { ...makeQuery(), page: 2 } })
    expect(marks(plain)).toEqual([])
  })

  it('compares by value: a new object with the same values flashes nothing', async () => {
    const m = mountFlash()
    await setRows(
      m,
      rowsOf(m).map(row => ({ ...row }))
    )
    expect(marks(m)).toEqual([])
  })

  it('watches only the field of a drawn column', async () => {
    const m = mountFlash()
    await setRows(
      m,
      rowsOf(m).map(row => (row.id === 1 ? { ...row, extra: 1 } : row))
    )
    expect(marks(m)).toEqual([])
  })

  it('keeps a row that moved quiet', async () => {
    const m = mountFlash()
    await setRows(m, [...rowsOf(m)].reverse())
    expect(marks(m)).toEqual([])
  })

  it.each([
    ['sort', { sort: { field: 'age', direction: 'asc' as const } }],
    [
      'filter',
      {
        filters: [{ field: 'name', condition: 'Contains' as const, value: 'a' }]
      }
    ],
    ['search', { search: 'bo' }],
    ['page', { page: 2 }],
    ['page size', { pageSize: 20 }]
  ])(
    'clears every flash on a %s and does not flash its answer',
    async (_name, change) => {
      const m = mountFlash()
      await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
      expect(marks(m)).toEqual(['td:0/age=a'])
      await m.setQuery(makeQuery(change))
      expect(marks(m)).toEqual([])
      await setRows(m, [
        ...withRow(rowsOf(m), 3, { age: 41 }),
        { id: 9, name: 'Ivy', age: 19, joined: '2024-09-09' }
      ])
      expect(marks(m)).toEqual([])
    }
  )

  it('does not flash an answer that arrives while loading', async () => {
    const m = mountFlash()
    await m.wrapper.setProps({ loading: true })
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    expect(marks(m)).toEqual([])
    await m.wrapper.setProps({ loading: false })
    await setRows(m, withRow(rowsOf(m), 1, { age: 32 }))
    expect(marks(m)).toEqual(['td:0/age=a'])
  })

  it('does not flash a cursor answer', async () => {
    const m = mountFlash({ query: { ...makeQuery(), cursor: null } })
    await m.setQuery({ ...makeQuery(), cursor: 'c2' } as never)
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    expect(marks(m)).toEqual([])
  })

  describe('with a rowsUpdate hint', () => {
    it.each<[RowsUpdate, string[]]>([
      ['live', ['td:0/age=a']],
      ['append', []],
      ['snapshot', []],
      ['reset', []]
    ])('%s flashes %j', async (hint, expected) => {
      const m = mountFlash({ rowsUpdate: 'live' })
      await setRows(m, withRow(rowsOf(m), 1, { age: 31 }), {
        rowsUpdate: hint
      })
      expect(marks(m)).toEqual(expected)
    })

    it('snapshot and reset clear the running flashes', async () => {
      for (const hint of ['snapshot', 'reset'] as const) {
        const m = mountFlash({ rowsUpdate: 'live' })
        await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
        expect(marks(m)).toEqual(['td:0/age=a'])
        await setRows(m, withRow(rowsOf(m), 2, { age: 26 }), {
          rowsUpdate: hint
        })
        expect(marks(m)).toEqual([])
        m.wrapper.unmount()
        mounted = null
      }
    })

    it('append adds a page without a flash and keeps the running ones', async () => {
      const m = mountFlash({ rowsUpdate: 'live' })
      await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
      await setRows(
        m,
        [...rowsOf(m), { id: 6, name: 'Fay', age: 22, joined: '2024-06-01' }],
        { rowsUpdate: 'append' }
      )
      expect(marks(m)).toEqual(['td:0/age=a'])
    })

    it('a constant live hint: the first rows after a query change are its answer', async () => {
      const m = mountFlash({ rowsUpdate: 'live' })
      await m.setQuery(makeQuery({ sort: { field: 'age', direction: 'desc' } }))
      await setRows(
        m,
        [...rowsOf(m)].reverse().map(row => ({ ...row, age: row.age + 1 }))
      )
      expect(marks(m)).toEqual([])
      await setRows(m, withRow(rowsOf(m), 3, { age: 99 }))
      expect(marks(m)).toEqual(['td:2/age=a'])
    })
  })

  it('emits nothing and keeps the order of the rows', async () => {
    const m = mountFlash()
    const before = rowsOf(m).map(row => row.id)
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    expect(m.events).toEqual([])
    expect(m.wrapper.emitted()).not.toHaveProperty('update:query')
    expect(
      m.wrapper.findAll('tbody tr').map(tr => tr.find('td').text())
    ).toEqual(before.map(String))
  })

  it('needs rowKey: without one nothing flashes and a development build warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const m = mountFlash({ rowKey: undefined })
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    await setRows(m, withRow(rowsOf(m), 2, { age: 26 }))
    expect(marks(m)).toEqual([])
    expect(
      warn.mock.calls.filter(([text]) => String(text).includes('`flash`'))
    ).toHaveLength(1)
  })

  it('warns once on a key two rows share, and never falls back to the index', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const rows = makeRows().map(row => (row.id === 2 ? { ...row, id: 1 } : row))
    const m = mountFlash({ rows })
    await setRows(
      m,
      rows.map(row => ({ ...row }))
    )
    expect(
      warn.mock.calls.filter(([text]) => String(text).includes('`flash`'))
    ).toHaveLength(1)
  })

  it('reads a function rowKey, and a new rowKey starts over', async () => {
    const m = mountFlash({ rowKey: (row: Row) => `k${row.id}` })
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    expect(marks(m)).toEqual(['td:0/age=a'])
    // The rows of that moment are the new baseline.
    await m.wrapper.setProps({
      rowKey: (row: Row) => `n${row.id}`,
      rows: withRow(rowsOf(m), 2, { age: 26 })
    })
    expect(marks(m)).toEqual([])
    await setRows(m, withRow(rowsOf(m), 2, { age: 27 }))
    expect(marks(m)).toEqual(['td:1/age=a'])
  })

  it('takes the flash options: rows or cells alone, and drops a kind turned off at once', async () => {
    const m = mountFlash({ flash: { cells: false } })
    const fay = { id: 6, name: 'Fay', age: 22, joined: '2024-06-01' }
    await setRows(m, [...withRow(rowsOf(m), 1, { age: 31 }), fay])
    expect(marks(m)).toEqual(['tr:5=a'])
    await m.wrapper.setProps({ flash: { rows: false } })
    expect(marks(m)).toEqual([])
    await setRows(m, [...withRow(rowsOf(m), 1, { age: 32 }), { ...fay, id: 7 }])
    expect(marks(m)).toEqual(['td:0/age=a'])
    await m.wrapper.setProps({ flash: { rows: true, cells: false } })
    expect(marks(m)).toEqual([])
    await m.wrapper.setProps({ flash: true })
    expect(marks(m)).toEqual([])
  })

  it('turning flash off drops every mark, timer and elapsed time at once', async () => {
    const m = mountFlash()
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    await m.wrapper.setProps({ flash: false })
    expect(marks(m)).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    expect(m.wrapper.html()).not.toContain('--qt-flash-elapsed')
    await setRows(m, withRow(rowsOf(m), 2, { age: 26 }))
    expect(marks(m)).toEqual([])
  })

  it('turned on later, takes the rows of that moment as the baseline', async () => {
    const m = mountFlash({ flash: false })
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    await m.wrapper.setProps({ flash: true })
    expect(marks(m)).toEqual([])
    await setRows(m, withRow(rowsOf(m), 1, { age: 32 }))
    expect(marks(m)).toEqual(['td:0/age=a'])
  })

  it('a hidden document flashes nothing and replays nothing on return', async () => {
    const m = mountFlash()
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true
    })
    try {
      await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
      expect(marks(m)).toEqual([])
    } finally {
      delete (document as { hidden?: boolean }).hidden
    }
    await setRows(m, withRow(rowsOf(m), 2, { age: 26 }))
    expect(marks(m)).toEqual(['td:1/age=a'])
  })

  it('prunes the flash of a hidden column; a column shown again is a quiet baseline', async () => {
    const m = mountFlash()
    await setRows(m, withRow(rowsOf(m), 1, { age: 31, name: 'Chuck' }))
    expect(marks(m)).toEqual(['td:0/name=a', 'td:0/age=a'])
    const hidden = makeColumns().map(c =>
      c.field === 'age' ? { ...c, hide: true } : c
    )
    await m.wrapper.setProps({ columns: hidden })
    expect(marks(m)).toEqual(['td:0/name=a'])
    await setRows(m, withRow(rowsOf(m), 1, { age: 50 }))
    await m.wrapper.setProps({ columns: makeColumns() })
    expect(marks(m)).toEqual(['td:0/name=a'])
  })

  it('KeepAlive: deactivated, nothing runs; activated, the rows are a quiet baseline', async () => {
    const shown = shallowRef(true)
    const rows = shallowRef(makeRows())
    const wrapper = mountHost(() =>
      h(KeepAlive, null, [
        shown.value
          ? h(QueryTable as unknown as Component, {
              key: 'table',
              columns: makeColumns(),
              rows: rows.value,
              query: makeQuery(),
              rowKey: 'id',
              flash: true,
              style: `--qt-flash-duration: ${DURATION}ms`
            })
          : h('p', { key: 'other' }, 'other')
      ])
    )
    const found = () =>
      wrapper.findAll('tbody [data-flash]').map(e => e.attributes('data-field'))
    rows.value = withRow(rows.value, 1, { age: 31 })
    await nextTick()
    expect(found()).toEqual(['age'])
    shown.value = false
    await nextTick()
    expect(vi.getTimerCount()).toBe(0)
    rows.value = withRow(rows.value, 2, { age: 26 })
    await nextTick()
    shown.value = true
    await nextTick()
    expect(found()).toEqual([])
    rows.value = withRow(rows.value, 3, { age: 41 })
    await nextTick()
    expect(found()).toEqual(['age'])
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('two tables keep their flashes apart', async () => {
    const a = mountTable({
      flash: true,
      rowKey: 'id',
      style: `--qt-flash-duration: ${DURATION}ms`
    })
    const b = mountTable({
      flash: true,
      rowKey: 'id',
      style: `--qt-flash-duration: ${DURATION}ms`
    })
    await setRows(a, withRow(rowsOf(a), 1, { age: 31 }))
    expect(marks(a)).toEqual(['td:0/age=a'])
    expect(marks(b)).toEqual([])
    await setRows(b, withRow(rowsOf(b), 2, { age: 26 }))
    await elapse(DURATION)
    expect(marks(a)).toEqual([])
    expect(marks(b)).toEqual([])
    a.wrapper.unmount()
    b.wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('C-94 Change flash: marks and timing [own]', () => {
  it('ends a flash after the duration the skin sets', async () => {
    const m = mountFlash()
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    await elapse(DURATION - 1)
    expect(marks(m)).toEqual(['td:0/age=a'])
    await elapse(1)
    expect(marks(m)).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reads a duration in seconds', async () => {
    const m = mountFlash({ style: '--qt-flash-duration: 1s' })
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    await elapse(999)
    expect(marks(m)).toEqual(['td:0/age=a'])
    await elapse(1)
    expect(marks(m)).toEqual([])
  })

  it.each([['0ms'], ['none'], [undefined]])(
    'marks nothing with a duration of %j, and the rows compared against still move',
    async duration => {
      const m = mountFlash({
        style:
          duration === undefined
            ? undefined
            : `--qt-flash-duration: ${duration}`
      })
      const read = vi.spyOn(globalThis, 'getComputedStyle')
      await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
      expect(marks(m)).toEqual([])
      // A second change in the same frame reads no style again.
      await setRows(m, withRow(rowsOf(m), 1, { age: 32 }))
      expect(read).toHaveBeenCalledTimes(1)
      read.mockRestore()
      // No timer: only the frame that bounds the read.
      await elapse(20)
      expect(vi.getTimerCount()).toBe(0)
      await m.wrapper.setProps({ style: `--qt-flash-duration: ${DURATION}ms` })
      await setRows(
        m,
        withRow(rowsOf(m), 1, { age: 32 }).map(row => ({ ...row }))
      )
      expect(marks(m)).toEqual([])
    }
  )

  it('restarts a flash that changes again: the other phase in a later frame, one phase change within a frame', async () => {
    const m = mountFlash()
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    expect(marks(m)).toEqual(['td:0/age=a'])
    await setRows(m, withRow(rowsOf(m), 1, { age: 32 }))
    expect(marks(m)).toEqual(['td:0/age=a'])
    await elapse(20)
    await setRows(m, withRow(rowsOf(m), 1, { age: 33 }))
    expect(marks(m)).toEqual(['td:0/age=b'])
    // The restart counts from the last change: the full duration again.
    await elapse(DURATION - 1)
    expect(marks(m)).toEqual(['td:0/age=b'])
    await elapse(1)
    expect(marks(m)).toEqual([])
  })

  it('never draws a mark whose time is up, even when the timer runs late', async () => {
    const m = mountFlash()
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    const now = performance.now()
    vi.spyOn(performance, 'now').mockReturnValue(now + DURATION)
    // A render for another reason, before the timer ran.
    await m.wrapper.setProps({ loading: true })
    expect(marks(m)).toEqual([])
  })

  it('an old wake does not end a newer flash', async () => {
    const m = mountFlash()
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    await elapse(300)
    await setRows(m, withRow(rowsOf(m), 2, { age: 26 }))
    await elapse(200)
    expect(marks(m)).toEqual(['td:1/age=a'])
    await elapse(300)
    expect(marks(m)).toEqual([])
  })

  it('a row that is new again flashes as a row, without its old cell flash', async () => {
    const m = mountFlash()
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    await setRows(
      m,
      rowsOf(m).filter(row => row.id !== 1)
    )
    await elapse(20)
    await setRows(m, [{ ...makeRows()[0], age: 35 }, ...rowsOf(m)])
    expect(marks(m)).toEqual(['tr:0=a'])
  })

  /** A table whose `cell-age` slot comes and goes: the cell is mounted again. */
  const mountWithSlot = () => {
    const withSlot = shallowRef(false)
    const rows = shallowRef(makeRows())
    const wrapper = mountHost(() =>
      h(
        QueryTable as unknown as Component,
        {
          columns: makeColumns(),
          rows: rows.value,
          query: makeQuery(),
          rowKey: 'id',
          flash: true,
          style: `--qt-flash-duration: ${DURATION}ms`
        },
        withSlot.value
          ? {
              'cell-age': (p: { cellValue: unknown }) =>
                h('b', String(p.cellValue))
            }
          : {}
      )
    )
    const ageCell = () =>
      wrapper.find('tbody tr td[data-field="age"]').element as HTMLElement
    return { wrapper, withSlot, rows, ageCell }
  }

  it('binds the elapsed time on a cell mounted after its flash began, once, and none on a cell bound at once', async () => {
    const host = mountWithSlot()
    host.rows.value = withRow(host.rows.value, 1, { age: 31 })
    await nextTick()
    const first = host.ageCell()
    expect(first.dataset.flash).toBe('a')
    expect(elapsedOf(first)).toBe('')
    await elapse(200)
    host.withSlot.value = true
    await nextTick()
    const second = host.ageCell()
    expect(second).not.toBe(first)
    expect(second.dataset.flash).toBe('a')
    expect(elapsedOf(second)).toBe('200ms')
    // Fixed while the element and its flash live: a later render keeps it.
    await elapse(100)
    host.rows.value = withRow(host.rows.value, 2, { name: 'Al' })
    await nextTick()
    expect(host.ageCell()).toBe(second)
    expect(elapsedOf(second)).toBe('200ms')
    // A restart binds it again: no time gone yet, so nothing written.
    await elapse(20)
    host.rows.value = withRow(host.rows.value, 1, { age: 32 })
    await nextTick()
    expect(second.dataset.flash).toBe('b')
    expect(elapsedOf(second)).toBe('')
    await elapse(DURATION)
    expect(second.hasAttribute('data-flash')).toBe(false)
    expect(elapsedOf(second)).toBe('')
    host.wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a cell whose own flash is fresh in a row bound late blocks the row value', async () => {
    const host = mountWithSlot()
    const fay = { id: 6, name: 'Fay', age: 22, joined: '2024-06-01' }
    host.rows.value = [...host.rows.value, fay]
    await nextTick()
    await elapse(150)
    // The row is mounted again with every cell: drop it and bring it back
    // in the same update would be a new row, so the slot remounts the cell
    // and the row value is checked on the row itself.
    const tr = () =>
      host.wrapper.find('tbody tr[data-row-index="5"]').element as HTMLElement
    expect(tr().dataset.flash).toBe('a')
    host.rows.value = withRow(host.rows.value, 6, { age: 23 })
    await nextTick()
    const cell = tr().querySelector<HTMLElement>('td[data-field="age"]')!
    expect(cell.dataset.flash).toBe('a')
    expect(elapsedOf(cell)).toBe('')
    host.wrapper.unmount()
  })

  it('removes the elapsed time of the body when flash turns off', async () => {
    const host = mountWithSlot()
    host.rows.value = withRow(host.rows.value, 1, { age: 31 })
    await nextTick()
    await elapse(200)
    host.withSlot.value = true
    await nextTick()
    expect(elapsedOf(host.ageCell())).toBe('200ms')
    host.wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
describe('C-95 Change flash off and DOM contract of 3.3 [own]', () => {
  /** Spies on everything the flash could call. */
  const spies = () => ({
    setTimeout: vi.spyOn(globalThis, 'setTimeout'),
    requestAnimationFrame: vi.spyOn(globalThis, 'requestAnimationFrame'),
    addEventListener: vi.spyOn(EventTarget.prototype, 'addEventListener'),
    getComputedStyle: vi.spyOn(globalThis, 'getComputedStyle'),
    performanceNow: vi.spyOn(performance, 'now')
  })
  type Spies = ReturnType<typeof spies>
  const counts = (s: Spies) =>
    Object.fromEntries(
      Object.entries(s).map(([name, spy]) => [name, spy.mock.calls.length])
    )

  /** Counts reads of the rows: the index and length reads a walk does. */
  const countedRows = (rows: Row[], tally: { reads: number }) =>
    new Proxy(rows, {
      get(target, property, receiver) {
        tally.reads++
        return Reflect.get(target, property, receiver) as unknown
      }
    })

  /** Mount, 20 live updates, unmount; what was called, the DOM after each step. */
  const run = async (props: Record<string, unknown>) => {
    const tally = { reads: 0 }
    const s = spies()
    const m = mountTable({ rowKey: 'id', ...props })
    const mountListeners = s.addEventListener.mock.calls.length
    const html: string[] = [m.wrapper.html()]
    let rows = makeRows()
    for (let i = 0; i < 20; i++) {
      rows = withRow(rows, (i % 5) + 1, { age: 50 + i })
      await m.wrapper.setProps({ rows: countedRows(rows, tally) })
      html.push(m.wrapper.html())
    }
    const before = counts(s)
    const listeners = {
      // Every listener added on the window or the document.
      global: s.addEventListener.mock.contexts.filter(
        target => target === window || target === document
      ).length,
      mount: mountListeners,
      updates: s.addEventListener.mock.calls.length - mountListeners
    }
    m.wrapper.unmount()
    vi.restoreAllMocks()
    return { calls: before, reads: tally.reads, html, listeners }
  }

  it('flash false draws the DOM of the 3.2 build, the snapshot flash-off-dom.spec.ts checks on both builds', async () => {
    await expect(await liveUpdateDom({ flash: false })).toMatchFileSnapshot(
      './__snapshots__/flash-off-dom.html'
    )
  })

  it('flash off (absent or false) calls nothing, walks no rows and draws the 3.2 DOM', async () => {
    const absent = await run({})
    const off = await run({ flash: false })
    expect(off.calls).toEqual(absent.calls)
    expect(off.reads).toBe(absent.reads)
    expect(off.html).toEqual(absent.html)
    expect(absent.html.join('')).not.toMatch(/data-flash|--qt-flash/)
    expect(absent.calls).toEqual({
      setTimeout: 0,
      requestAnimationFrame: 0,
      addEventListener: absent.calls.addEventListener,
      getComputedStyle: 0,
      performanceNow: absent.calls.performanceNow
    })
    expect(rowChanges.createRowChangeTracker).not.toHaveBeenCalled()
  })

  it('flash off adds no timer, frame, style read or clock read to a table without it', async () => {
    const absent = await run({})
    expect(absent.calls.setTimeout).toBe(0)
    expect(absent.calls.requestAnimationFrame).toBe(0)
    expect(absent.calls.getComputedStyle).toBe(0)
    expect(absent.calls.performanceNow).toBe(0)
  })

  it('flash on adds no listener anywhere: not on window, document or the table', async () => {
    const absent = await run({})
    const on = await run({
      flash: true,
      style: `--qt-flash-duration: ${DURATION}ms`
    })
    expect(on.calls.addEventListener).toBe(absent.calls.addEventListener)
    // Absolutely: nothing on the window or the document, nothing while the
    // rows change, and the mount adds the table's own listeners only.
    expect(on.listeners.global).toBe(0)
    expect(on.listeners.updates).toBe(0)
    expect(absent.listeners.global).toBe(0)
    expect(absent.listeners.updates).toBe(0)
    expect(on.listeners.mount).toBe(absent.listeners.mount)
    expect(rowChanges.createRowChangeTracker).toHaveBeenCalledTimes(1)
  })

  it('leaves no timer and no frame after unmount', async () => {
    const m = mountFlash()
    await setRows(m, withRow(rowsOf(m), 1, { age: 31 }))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    m.wrapper.unmount()
    mounted = null
    expect(vi.getTimerCount()).toBe(0)
  })

  it('runs nothing on the server: no timer, no clock, no tracker', async () => {
    const render = async (flash: boolean) => {
      const s = spies()
      const app = createSSRApp({
        render: () =>
          h(QueryTable as unknown as Component, {
            columns: makeColumns(),
            rows: makeRows(),
            query: makeQuery(),
            rowKey: 'id',
            flash
          })
      })
      const html = await renderToString(app)
      const calls = counts(s)
      vi.restoreAllMocks()
      return { html, calls }
    }
    // A first render warms up what the renderer sets up once.
    await render(false)
    const off = await render(false)
    const on = await render(true)
    expect(on.html).toBe(off.html)
    expect(on.html).not.toContain('data-flash')
    // Whatever the server renderer calls itself, the flash adds nothing.
    expect(on.calls).toEqual(off.calls)
    expect(on.calls.requestAnimationFrame).toBe(0)
    expect(on.calls.performanceNow).toBe(0)
    expect(on.calls.getComputedStyle).toBe(0)
    expect(rowChanges.createRowChangeTracker).not.toHaveBeenCalled()
  })
})
