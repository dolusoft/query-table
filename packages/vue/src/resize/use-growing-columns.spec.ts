import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import type { Column } from '../contract'
import { useGrowingColumns } from './use-growing-columns'

// The read needs a real layout; the browser tests (growing-columns browser
// spec) check it. Here the widths are stubs, so the rules around the read
// are checked alone: when it reads, how it divides, what it draws and emits.

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

/** Widths the stubbed layout gives, by element. */
const widths = new Map<Element, number>()
let table: HTMLTableElement
let container: HTMLDivElement
let inner = 1000
/** The table's width at its bases (the read) and as drawn (the rest). */
const layout = { natural: 300, drawn: 1000 }
let wrapper: VueWrapper | null = null

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeObserver)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      const width =
        this === table
          ? table.style.getPropertyValue('min-width')
            ? layout.natural
            : layout.drawn
          : (widths.get(this) ?? 0)
      return {
        width,
        height: 10,
        top: 0,
        left: 0,
        right: width,
        bottom: 10,
        x: 0,
        y: 0,
        toJSON: () => ({})
      } as DOMRect
    }
  )
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  container?.remove()
  widths.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const columns3 = (): Column[] => [
  { field: 'id', title: 'ID', width: '100px' },
  { field: 'name', title: 'Name', width: '100px', grow: 1 },
  { field: 'note', title: 'Note', width: '100px', grow: 3 }
]

const setup = async (
  given: {
    columns?: Column[]
    autoWidth?: boolean
    autoWidths?: Record<string, number>
    natural?: number
    inner?: number
    attached?: boolean
  } = {}
) => {
  inner = given.inner ?? 1000
  layout.natural = given.natural ?? 300
  layout.drawn = 1000
  container = document.createElement('div')
  table = document.createElement('table')
  const row = table.createTHead().insertRow()
  const columns = shallowRef<Column[]>(given.columns ?? columns3())
  for (const column of columns.value) {
    const th = document.createElement('th')
    th.dataset.field = column.field
    row.append(th)
    widths.set(th, 100)
  }
  if (given.attached !== false) {
    container.append(table)
  }
  document.body.append(container)
  Object.defineProperty(container, 'clientWidth', {
    configurable: true,
    get: () => inner
  })
  const enabled = shallowRef(true)
  const tableRef = shallowRef<HTMLTableElement | null>(table)
  const autoWidths = shallowRef<Record<string, number>>(given.autoWidths ?? {})
  const preview = shallowRef<{ field: string; width: number } | null>(null)
  let api!: ReturnType<typeof useGrowingColumns>
  wrapper = mount(
    defineComponent({
      setup() {
        api = useGrowingColumns({
          enabled: () => enabled.value,
          table: tableRef,
          columns: () => columns.value,
          autoWidth: () => given.autoWidth ?? false,
          autoWidths: () => autoWidths.value,
          utilities: () => '',
          preview: () => preview.value
        })
        return () => h('div')
      }
    })
  )
  await nextTick()
  await nextTick()
  return { api, enabled, columns, autoWidths, preview, tableRef }
}

describe('useGrowingColumns (C-132)', () => {
  it('divides the room by the weights and draws each growing column at its base and share', async () => {
    const { api } = await setup()
    expect(api.shares.value).toEqual({ name: 175, note: 525 })
    expect(api.active.value).toBe(true)
    expect(api.widthOf('name')).toBe(275)
    expect(api.widthOf('note')).toBe(625)
    expect(api.widthOf('id')).toBeUndefined()
    // The read puts every style back (P5).
    expect(table.getAttribute('style')).toBeNull()
    expect(FakeObserver.last?.observed).toEqual([container, table])
  })

  it('a container that changes divides again without a read; a table that moved is read again', async () => {
    const { api } = await setup()
    inner = 500
    layout.natural = 999
    // The table as the new shares draw it, as wide as the container:
    // nothing moved under it.
    layout.drawn = 500
    FakeObserver.last!.fire()
    expect(api.shares.value).toEqual({ name: 50, note: 150 })
    // Now drawn wider than the shares make it: read again.
    layout.natural = 400
    layout.drawn = 1200
    FakeObserver.last!.fire()
    expect(api.shares.value).toEqual({ name: 25, note: 75 })
  })

  it('without room there are no shares and a resize emits the drawn width', async () => {
    const { api } = await setup({ inner: 250 })
    expect(api.shares.value).toEqual({})
    expect(api.active.value).toBe(false)
    expect(api.widthOf('name')).toBeUndefined()
    expect(api.emitted('name', 180)).toBe(180)
  })

  it('a table not displayed waits, and reads once the observer fires', async () => {
    const { api } = await setup({ natural: 0 })
    expect(api.shares.value).toEqual({})
    layout.natural = 300
    FakeObserver.last!.fire()
    expect(api.shares.value).toEqual({ name: 175, note: 525 })
  })

  it('a column that does not grow and has no width stops the shares; without autoWidth it warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const blocked: Column[] = [
      { field: 'id', title: 'ID' },
      { field: 'name', title: 'Name', width: '100px', grow: 1 }
    ]
    const { api, columns } = await setup({ columns: blocked })
    expect(api.shares.value).toEqual({})
    columns.value = [
      ...blocked,
      { field: 'note', title: 'Note', width: '50px' }
    ]
    await nextTick()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('`grow`')
  })

  it('with autoWidth an automatic width counts, and a growing column grows from it, else from minWidth', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { api, autoWidths } = await setup({
      columns: [
        { field: 'id', title: 'ID' },
        { field: 'name', title: 'Name', grow: 1, minWidth: 60 },
        { field: 'note', title: 'Note', grow: 1 }
      ],
      autoWidth: true
    })
    // No automatic width yet: wait, silently.
    expect(api.shares.value).toEqual({})
    autoWidths.value = { id: 90, note: 110 }
    await nextTick()
    await nextTick()
    expect(api.shares.value).toEqual({ name: 350, note: 350 })
    expect(warn).not.toHaveBeenCalled()
  })

  it('a drag of a column that does not grow moves the room; a dragged growing column takes no share', async () => {
    const { api, preview } = await setup()
    preview.value = { field: 'id', width: 150 }
    expect(api.shares.value).toEqual({ name: 162, note: 488 })
    preview.value = { field: 'name', width: 300 }
    expect(api.shares.value).toEqual({ note: 500 })
    expect(api.widthOf('name')).toBeUndefined()
    preview.value = null
    expect(api.shares.value).toEqual({ name: 175, note: 525 })
  })

  it('emits the base that keeps a growing column at its drawn width (D-05), else the drawn width', async () => {
    const { api } = await setup()
    // Room without its base 800, weights 1 of 4: (300 * 4 - 800) / 3.
    expect(api.emitted('name', 300)).toBeCloseTo(400 / 3)
    expect(api.emitted('id', 150)).toBe(150)
    expect(api.emitted('missing', 150)).toBe(150)
  })

  it('a width in another unit grows from the width it is drawn at', async () => {
    const { api } = await setup({
      columns: [
        { field: 'id', title: 'ID', width: '100px' },
        { field: 'name', title: 'Name', width: '10rem', grow: 1 }
      ]
    })
    widths.set(table.querySelector('th[data-field="name"]')!, 160)
    layout.natural = 260
    layout.drawn = 0
    FakeObserver.last!.fire()
    expect(api.widthOf('name')).toBe(160 + 740)
  })

  it('off, or with no growing column, it reads nothing and lets go of the observer', async () => {
    const { api, enabled, columns } = await setup()
    const observer = FakeObserver.last!
    enabled.value = false
    await nextTick()
    await nextTick()
    expect(api.shares.value).toEqual({})
    expect(observer.disconnected).toBe(true)
    enabled.value = true
    columns.value = [{ field: 'id', title: 'ID', width: '100px' }]
    await nextTick()
    await nextTick()
    expect(api.shares.value).toEqual({})
  })

  it('a table without a parent reads nothing', async () => {
    const { api } = await setup({ attached: false })
    expect(api.shares.value).toEqual({})
  })
})
