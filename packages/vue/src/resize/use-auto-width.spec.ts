import type { Query } from '@dolusoft/query-protocol'
import type { RowsUpdate } from '@dolusoft/query-table-core/row-changes'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import type { Column } from '../contract'
import { useAutoWidth } from './use-auto-width'

// The measure needs a real layout; the browser tests (auto-width.browser.spec)
// check it. Here it is a stub, so the rules around it are checked alone.
interface MeasureStub {
  /** What the stub measures, by field; a field left out has no box. */
  widths: Record<string, number>
  /** The fields of every call. */
  calls: string[][]
  /** The options of every call. */
  options: ({ filters?: boolean } | undefined)[]
}
const measure = vi.hoisted((): MeasureStub => ({
  widths: {},
  calls: [],
  options: []
}))
vi.mock('./measure-widths', () => ({
  measureColumnWidths: (
    _table: unknown,
    fields: string[],
    _body: unknown,
    options?: { filters?: boolean }
  ) => {
    measure.calls.push(fields)
    measure.options.push(options)
    return Object.fromEntries(
      fields
        .filter(field => measure.widths[field] !== undefined)
        .map(field => [field, measure.widths[field]])
    )
  }
}))

/** A `ResizeObserver` the test fires by hand. */
class FakeObserver {
  static last: FakeObserver | null = null
  observed: Element[] = []
  disconnected = false
  constructor(readonly callback: () => void) {
    FakeObserver.last = this
  }
  observe(element: Element) {
    this.observed.push(element)
  }
  disconnect() {
    this.disconnected = true
  }
  fire() {
    this.callback()
  }
}

const query = (overrides: Partial<Query> = {}): Query => ({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: [],
  ...overrides
})

const setup = (given: { columns?: Column[]; max?: number } = {}) => {
  const enabled = shallowRef(true)
  const max = shallowRef<number | undefined>(given.max)
  const table = shallowRef<HTMLTableElement | null>(
    document.createElement('table')
  )
  const columns = shallowRef<Column[]>(
    given.columns ?? [
      { field: 'name', title: 'Name' },
      { field: 'code', title: 'Code', width: '300px' }
    ]
  )
  const rows = shallowRef<unknown[]>([{ id: 1 }])
  const q = shallowRef<Query>(query())
  const hint = shallowRef<RowsUpdate | undefined>(undefined)
  let api!: ReturnType<typeof useAutoWidth>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useAutoWidth({
          enabled: () => enabled.value,
          max: () => max.value,
          table,
          body: () => null,
          columns: () => columns.value,
          rows: () => rows.value,
          query: () => q.value,
          rowsUpdate: () => hint.value
        })
        return () => h('div')
      }
    })
  )
  mounted.push(wrapper)
  return { api, enabled, max, table, columns, rows, query: q, hint, wrapper }
}

const mounted: VueWrapper[] = []

/** Rows of the same result arrive; the watcher runs after the update. */
const arrive = async (
  state: ReturnType<typeof setup>,
  rows: unknown[] = [{ id: Math.random() }]
) => {
  state.rows.value = rows
  await nextTick()
}

beforeEach(() => {
  measure.widths = { name: 120, code: 50 }
  measure.calls = []
  measure.options = []
  FakeObserver.last = null
  vi.stubGlobal('ResizeObserver', FakeObserver)
})

afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  vi.unstubAllGlobals()
})

describe('C-100 use-auto-width', () => {
  it('measures only the columns without a width, clamped as a resize is', async () => {
    const state = setup({
      columns: [
        { field: 'name', title: 'Name' },
        { field: 'tiny', title: 'Tiny' },
        { field: 'code', title: 'Code', width: '300px' }
      ]
    })
    measure.widths = { name: 120, tiny: 10 }
    await arrive(state)
    expect(measure.calls.at(-1)).toEqual(['name', 'tiny'])
    // The default minimum of a resize (40) holds.
    expect(state.api.widths.value).toEqual({ name: 120, tiny: 40 })
  })

  it('lets a maxWidth or autoWidthMax below the filter floor win', async () => {
    const state = setup({
      max: 90,
      columns: [
        { field: 'name', title: 'Name' },
        { field: 'code', title: 'Code', maxWidth: 70 }
      ]
    })
    // What the measure gives includes the floor (the stub stands for it).
    measure.widths = { name: 120, code: 120 }
    await arrive(state)
    expect(state.api.widths.value).toEqual({ name: 90, code: 70 })
  })

  it('counts the filter row as a floor in every measure', async () => {
    const state = setup()
    await arrive(state)
    expect(measure.options.length).toBeGreaterThan(0)
    expect(measure.options.every(options => options?.filters === true)).toBe(
      true
    )
  })

  it('caps a column without maxWidth at autoWidthMax, and lets its own maxWidth win', async () => {
    const state = setup({
      max: 100,
      columns: [
        { field: 'name', title: 'Name' },
        { field: 'code', title: 'Code', maxWidth: 200 },
        { field: 'loose', title: 'Loose', maxWidth: Number.NaN }
      ]
    })
    measure.widths = { name: 500, code: 500, loose: 500 }
    await arrive(state)
    expect(state.api.widths.value).toEqual({ name: 100, code: 200, loose: 100 })
  })

  it('only grows within one result, and starts over on another query', async () => {
    const state = setup()
    await arrive(state)
    expect(state.api.widths.value).toEqual({ name: 120 })

    measure.widths = { name: 80 }
    state.query.value = query({
      page: 2,
      pageSize: 25,
      sort: { field: 'name', direction: 'asc' }
    })
    await arrive(state)
    expect(state.api.widths.value).toEqual({ name: 120 })

    measure.widths = { name: 160 }
    await arrive(state)
    expect(state.api.widths.value).toEqual({ name: 160 })

    measure.widths = { name: 70 }
    state.query.value = query({
      filters: [{ field: 'name', condition: 'Contains', value: 'a' }]
    })
    await arrive(state)
    expect(state.api.widths.value).toEqual({ name: 70 })
  })

  it('treats a cursor query apart from its cursor as the same result', async () => {
    const state = setup()
    state.query.value = { cursor: null, pageSize: 10, sort: null, filters: [] }
    await arrive(state)
    measure.widths = { name: 60 }
    state.query.value = {
      cursor: { token: 'next', direction: 'next' },
      pageSize: 10,
      sort: null,
      filters: []
    }
    await arrive(state)
    expect(state.api.widths.value).toEqual({ name: 120 })
  })

  it('starts over with rowsUpdate reset, a new autoWidthMax and autoWidth turned on again', async () => {
    const state = setup()
    await arrive(state)

    measure.widths = { name: 90 }
    state.hint.value = 'reset'
    await arrive(state)
    expect(state.api.widths.value).toEqual({ name: 90 })

    state.hint.value = 'live'
    measure.widths = { name: 60 }
    state.max.value = 500
    await nextTick()
    expect(state.api.widths.value).toEqual({ name: 60 })

    state.enabled.value = false
    await nextTick()
    expect(state.api.widths.value).toEqual({})
    expect(FakeObserver.last!.disconnected).toBe(true)

    measure.widths = { name: 50 }
    state.enabled.value = true
    await nextTick()
    expect(state.api.widths.value).toEqual({ name: 50 })
  })

  it('measures nothing without data rows, a table or a column without a width, and keeps what it has', async () => {
    const state = setup()
    await arrive(state)
    const before = state.api.widths.value
    measure.calls = []

    await arrive(state, [])
    state.columns.value = [{ field: 'code', title: 'Code', width: '300px' }]
    await nextTick()
    state.table.value = null
    await nextTick()
    expect(measure.calls).toEqual([])
    expect(state.api.widths.value).toBe(before)
  })

  it('starts over with the first rows of a new query that answered empty', async () => {
    const state = setup()
    await arrive(state)
    state.query.value = query({ search: 'x' })
    await arrive(state, [])
    measure.widths = { name: 70 }
    await arrive(state)
    expect(state.api.widths.value).toEqual({ name: 70 })
  })

  it('keeps its widths while the table is not displayed and measures once it is', async () => {
    const state = setup()
    await arrive(state)
    // Not displayed: nothing has a box, the measure returns nothing.
    measure.widths = {}
    await arrive(state)
    expect(state.api.widths.value).toEqual({ name: 120 })

    // A resize while still hidden changes nothing.
    FakeObserver.last!.fire()
    expect(state.api.widths.value).toEqual({ name: 120 })

    measure.widths = { name: 140 }
    FakeObserver.last!.fire()
    expect(state.api.widths.value).toEqual({ name: 140 })

    // Displayed and measured: a resize no longer measures.
    measure.calls = []
    FakeObserver.last!.fire()
    expect(measure.calls).toEqual([])
  })

  it('does not replace the widths with equal ones', async () => {
    const state = setup()
    await arrive(state)
    const before = state.api.widths.value
    await arrive(state)
    expect(state.api.widths.value).toBe(before)
  })

  it('observes a new table, and disconnects on unmount', async () => {
    const state = setup()
    await nextTick()
    const first = FakeObserver.last!
    state.table.value = document.createElement('table')
    await nextTick()
    expect(first.disconnected).toBe(true)
    const second = FakeObserver.last!
    expect(second).not.toBe(first)
    state.wrapper.unmount()
    mounted.splice(mounted.indexOf(state.wrapper), 1)
    expect(second.disconnected).toBe(true)
  })

  it('works without ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const state = setup()
    await arrive(state)
    expect(state.api.widths.value).toEqual({ name: 120 })
  })
})
