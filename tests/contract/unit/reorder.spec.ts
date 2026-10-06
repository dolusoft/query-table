import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Column, ColumnChangeReason } from '@dolusoft/query-table'

import { mountTable, type Mounted } from '../../support/mount-table'

// C-73 without a layout engine: header cells are faked 100px boxes in the
// drawn order, the pointer capture is a no-op. The browser spec
// (`reorder.browser.spec.ts`) drags in a real layout.

let mounted: Mounted | null = null

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(
    () => undefined
  )
  // Each header cell is 100px wide, at its place among the header cells.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const cells = [
        ...(this.closest('thead')?.querySelectorAll('th[data-field]') ?? [])
      ]
      const left = Math.max(0, cells.indexOf(this)) * 100
      return { left, right: left + 100, width: 100 } as DOMRect
    }
  )
})

const columns = (): Column[] => [
  { field: 'id', title: 'ID' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age' },
  { field: 'joined', title: 'Joined' }
]

type Change = [Column[], ColumnChangeReason]

/** A consumer that writes `columns` back unless `writeBack` is off. */
const mountIt = (props: Record<string, unknown> = {}, writeBack = true) => {
  const changes: Change[] = []
  const m: Mounted = mountTable({
    columns: columns(),
    reorderable: true,
    sortable: true,
    'onUpdate:columns': (next: Column[], reason: ColumnChangeReason) => {
      changes.push([next, reason])
      if (writeBack) {
        void m.wrapper.setProps({ columns: next })
      }
    },
    ...props
  })
  mounted = m
  return { m, changes }
}

const handle = (m: Mounted, field: string) =>
  m.wrapper.find(`th[data-field="${field}"] .qt-reorder-handle`)
    .element as HTMLElement
const order = (m: Mounted) =>
  m.wrapper
    .findAll('thead th[data-field]')
    .map(th => th.attributes('data-field'))
const fields = (change: Change) => change[0].map(column => column.field)
const marks = (m: Mounted) => ({
  dragging: m.wrapper
    .findAll('th[data-dragging]')
    .map(th => th.attributes('data-field')),
  drop: m.wrapper
    .findAll('th[data-drop]')
    .map(th => `${th.attributes('data-field')}:${th.attributes('data-drop')}`)
})

const pointer = (
  el: Element,
  type: string,
  clientX: number,
  init: PointerEventInit = {}
) =>
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      button: 0,
      clientX,
      ...init
    })
  )
const key = (el: Element, name: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))

const tick = (m: Mounted) => m.wrapper.vm.$nextTick()

describe('C-73 Reorder handle (unit) [own]', () => {
  it('draws a handle only with table and column reorderable', () => {
    const off = mountTable({ columns: columns() })
    expect(off.wrapper.find('.qt-reorder-handle').exists()).toBe(false)
    off.wrapper.unmount()
    const { m } = mountIt({
      columns: [{ field: 'id', reorderable: false }, ...columns().slice(1)]
    })
    expect(m.wrapper.findAll('.qt-reorder-handle')).toHaveLength(3)
    expect(
      m.wrapper.find('th[data-field="id"] .qt-reorder-handle').exists()
    ).toBe(false)
  })

  it('previews a drag with attributes and emits one order on release', async () => {
    const { m, changes } = mountIt()
    const h = handle(m, 'id')
    pointer(h, 'pointerdown', 50)
    expect(document.activeElement).toBe(h)
    await tick(m)
    expect(marks(m)).toEqual({ dragging: ['id'], drop: [] })
    pointer(h, 'pointermove', 280)
    await tick(m)
    expect(marks(m)).toEqual({ dragging: ['id'], drop: ['age:after'] })
    // The same target and half again: nothing new.
    pointer(h, 'pointermove', 290)
    pointer(h, 'pointermove', 210)
    await tick(m)
    expect(marks(m).drop).toEqual(['age:before'])
    // Another pointer, a second press and an off-button press change nothing.
    pointer(h, 'pointermove', 380, { pointerId: 2 })
    pointer(h, 'pointerdown', 380)
    pointer(handle(m, 'name'), 'pointerdown', 150, { button: 2 })
    await tick(m)
    expect(marks(m).drop).toEqual(['age:before'])
    expect(changes).toEqual([])
    pointer(h, 'pointerup', 210)
    await tick(m)
    expect(changes.map(fields)).toEqual([['name', 'id', 'age', 'joined']])
    expect(changes[0][1]).toBe('order')
    expect(order(m)).toEqual(['name', 'id', 'age', 'joined'])
    expect(marks(m)).toEqual({ dragging: [], drop: [] })
    expect(m.events).toEqual([])
  })

  it('releasing on no target or outside the region emits nothing', async () => {
    const { m, changes } = mountIt({
      columns: [{ field: 'id', pinned: 'left' }, ...columns().slice(1)]
    })
    const h = handle(m, 'name')
    pointer(h, 'pointerdown', 150)
    // Over itself, then over the left-pinned `id` (another region), then
    // beyond every cell.
    pointer(h, 'pointermove', 160)
    pointer(h, 'pointermove', 50)
    pointer(h, 'pointermove', 900)
    await tick(m)
    expect(marks(m)).toEqual({ dragging: ['name'], drop: [] })
    pointer(h, 'pointerup', 900)
    await tick(m)
    expect(changes).toEqual([])
  })

  it.each([
    ['Escape', (h: HTMLElement) => key(h, 'Escape')],
    ['pointercancel', (h: HTMLElement) => pointer(h, 'pointercancel', 0)],
    [
      'lostpointercapture',
      (h: HTMLElement) => pointer(h, 'lostpointercapture', 0)
    ]
  ])('%s ends the drag without an event', async (_, stop) => {
    const { m, changes } = mountIt()
    const h = handle(m, 'id')
    pointer(h, 'pointerdown', 50)
    pointer(h, 'pointermove', 350)
    // A key other than Escape does nothing while dragging.
    key(h, 'ArrowRight')
    await tick(m)
    expect(marks(m).drop).toEqual(['joined:after'])
    stop(h)
    await tick(m)
    expect(marks(m)).toEqual({ dragging: [], drop: [] })
    pointer(h, 'pointerup', 350)
    await tick(m)
    expect(changes).toEqual([])
  })

  it('keys move within the region and the focus comes back', async () => {
    const { m, changes } = mountIt()
    handle(m, 'id').focus()
    key(handle(m, 'id'), 'ArrowRight')
    await tick(m)
    await tick(m)
    expect(order(m)).toEqual(['name', 'id', 'age', 'joined'])
    expect(document.activeElement).toBe(handle(m, 'id'))
    key(handle(m, 'id'), 'End')
    await tick(m)
    key(handle(m, 'id'), 'End')
    key(handle(m, 'id'), 'ArrowRight')
    key(handle(m, 'id'), 'Tab')
    await tick(m)
    key(handle(m, 'id'), 'Home')
    await tick(m)
    key(handle(m, 'id'), 'ArrowLeft')
    key(handle(m, 'id'), 'Home')
    await tick(m)
    expect(changes.map(fields)).toEqual([
      ['name', 'id', 'age', 'joined'],
      ['name', 'age', 'joined', 'id'],
      ['id', 'name', 'age', 'joined']
    ])
    await tick(m)
    expect(document.activeElement).toBe(handle(m, 'id'))
  })

  it('an outside change ends a drag and gives no focus once the user left', async () => {
    const { m, changes } = mountIt({}, false)
    const h = handle(m, 'name')
    h.focus()
    key(h, 'ArrowRight')
    expect(changes).toHaveLength(1)
    // The user leaves the handle, then starts a drag on another one.
    h.blur()
    const other = handle(m, 'age')
    pointer(other, 'pointerdown', 250)
    pointer(other, 'pointermove', 20)
    await tick(m)
    expect(marks(m).drop).toEqual(['id:before'])
    other.blur()
    await m.wrapper.setProps({ columns: columns().slice(0, 3) })
    await tick(m)
    expect(marks(m)).toEqual({ dragging: [], drop: [] })
    expect(document.activeElement).not.toBe(h)
    pointer(other, 'pointerup', 20)
    await tick(m)
    expect(changes).toHaveLength(1)
  })

  it('a click on the handle never sorts', async () => {
    const { m, changes } = mountIt()
    const h = m.wrapper.find('th[data-field="name"] .qt-reorder-handle')
    await h.trigger('click')
    await h.trigger('keydown', { key: 'Enter' })
    expect(m.events).toEqual([])
    expect(changes).toEqual([])
  })

  it('unmounting during a drag leaves nothing behind', () => {
    const { m } = mountIt()
    pointer(handle(m, 'id'), 'pointerdown', 50)
    m.wrapper.unmount()
    mounted = null
  })
})
