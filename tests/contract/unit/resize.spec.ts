import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Column } from '@dolusoft/query-table'

import { mountTable, type Mounted } from '../../support/mount-table'

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
  vi.restoreAllMocks()
})

const columns = (): Column[] => [
  { field: 'id', title: 'ID', resizable: false },
  { field: 'name', title: 'Name', minWidth: 60, maxWidth: 300 },
  { field: 'age', title: 'Age' }
]

const handle = (m: Mounted, field: string) =>
  m.wrapper.find(`th[data-field="${field}"] .qt-resize-handle`)

const resized = (m: Mounted) =>
  (m.wrapper.emitted('columnResize') ?? []).map(([payload]) => payload)

// happy-dom lays nothing out: give every header cell a fixed width.
const headerWidth = (width: number) =>
  vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => ({ width }) as DOMRect)

describe('C-48 Resize handle', () => {
  it('draws a handle only with table and column resizable', () => {
    expect(
      mountIt({ columns: columns() }).wrapper.find('.qt-resize-handle').exists()
    ).toBe(false)
    mounted!.wrapper.unmount()
    const m = mountIt({ columns: columns(), resizable: true })
    expect(handle(m, 'id').exists()).toBe(false)
    expect(handle(m, 'name').exists()).toBe(true)
    expect(handle(m, 'age').exists()).toBe(true)
  })

  it('is a named, focusable vertical separator after the sort button and filter row', () => {
    const m = mountIt({
      columns: columns(),
      resizable: true,
      sortable: true,
      filterable: true
    })
    const h = handle(m, 'name')
    expect(h.element.tagName).toBe('DIV')
    expect(h.attributes()).toMatchObject({
      role: 'separator',
      'aria-orientation': 'vertical',
      tabindex: '0',
      'aria-label': 'Resize Name',
      'aria-valuemin': '60',
      'aria-valuemax': '300'
    })
    expect(h.attributes('aria-valuenow')).toBeDefined()
    // The default minimum, and the label from `labels`.
    expect(handle(m, 'age').attributes('aria-valuemin')).toBe('40')
    const th = m.wrapper.find('th[data-field="name"]').element
    expect(th.lastElementChild).toBe(h.element)
    expect(h.element.closest('button')).toBeNull()
  })

  it('takes its name from labels.resizeColumn', () => {
    const m = mountIt({
      columns: columns(),
      resizable: true,
      labels: { resizeColumn: (name: string) => `${name} genişliği` }
    })
    expect(handle(m, 'name').attributes('aria-label')).toBe('Name genişliği')
  })

  it('never sorts: clicks and keys on the handle emit no update', async () => {
    headerWidth(100)
    const m = mountIt({ columns: columns(), resizable: true, sortable: true })
    const h = handle(m, 'name')
    await h.trigger('click')
    await h.trigger('dblclick')
    await h.trigger('keydown', { key: 'Enter' })
    await h.trigger('keydown', { key: ' ' })
    await h.trigger('keydown', { key: 'ArrowRight' })
    expect(m.events).toEqual([])
    expect(resized(m).length).toBeGreaterThan(0)
  })
})

describe('C-49 Dragging a handle', () => {
  // JS and loosely typed consumers can pass what the types forbid.
  const loose = (limits: Record<string, unknown>) =>
    ({ field: 'x', ...limits }) as Column

  it('draws aria-valuemin and aria-valuemax from the guarded limits', async () => {
    headerWidth(100)
    const m = mountIt({
      columns: [
        loose({ field: 'a', title: 'A', minWidth: '', maxWidth: '' }),
        loose({ field: 'b', title: 'B', minWidth: 200, maxWidth: 100 })
      ],
      resizable: true
    })
    await m.wrapper.vm.$nextTick()
    expect(handle(m, 'a').attributes('aria-valuemin')).toBe('40')
    expect(
      Number(handle(m, 'a').attributes('aria-valuemax'))
    ).toBeGreaterThanOrEqual(100)
    expect(handle(m, 'b').attributes('aria-valuemin')).toBe('200')
    expect(handle(m, 'b').attributes('aria-valuemax')).toBe('200')
  })
})

const nextFrame = () =>
  new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))

/** Dispatches a pointer event on a handle; pointer 1, primary button. */
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

describe('C-49 Dragging a handle (unit)', () => {
  const start = () => {
    headerWidth(100)
    const m = mountIt({ columns: columns(), resizable: true })
    const h = handle(m, 'age').element
    const capture = vi
      .spyOn(h, 'setPointerCapture')
      .mockImplementation(() => undefined)
    const th = m.wrapper.find('th[data-field="age"]').element as HTMLElement
    return { m, h, th, capture }
  }

  it('previews once per frame and emits one clamped width on release', async () => {
    const { m, h, th, capture } = start()
    pointer(h, 'pointerdown', 100)
    expect(document.activeElement).toBe(h)
    expect(capture).toHaveBeenCalledWith(1)
    pointer(h, 'pointermove', 120)
    pointer(h, 'pointermove', 150)
    // Nothing yet: the preview waits for the frame.
    expect(th.style.width).toBe('')
    await nextFrame()
    await m.wrapper.vm.$nextTick()
    expect(th.style.width).toBe('150px')
    expect(resized(m)).toEqual([])
    // A minimum clamps the preview too.
    pointer(h, 'pointermove', 0)
    await nextFrame()
    await m.wrapper.vm.$nextTick()
    expect(th.style.width).toBe('40px')
    pointer(h, 'pointerup', 175)
    await m.wrapper.vm.$nextTick()
    expect(resized(m)).toEqual([{ field: 'age', width: 175 }])
    expect(th.style.width).toBe('')
  })

  it('emits nothing for a release at the starting width', async () => {
    const { m, h } = start()
    pointer(h, 'pointerdown', 100)
    pointer(h, 'pointerup', 100)
    await m.wrapper.vm.$nextTick()
    expect(resized(m)).toEqual([])
  })

  it.each(['pointercancel', 'lostpointercapture'])(
    '%s cancels the drag and drops the preview',
    async type => {
      const { m, h, th } = start()
      pointer(h, 'pointerdown', 100)
      pointer(h, 'pointermove', 160)
      await nextFrame()
      await m.wrapper.vm.$nextTick()
      expect(th.style.width).toBe('160px')
      pointer(h, type, 160)
      await m.wrapper.vm.$nextTick()
      expect(th.style.width).toBe('')
      pointer(h, 'pointerup', 160)
      expect(resized(m)).toEqual([])
    }
  )

  it('Escape cancels; other keys do nothing while dragging', async () => {
    const { m, h } = start()
    pointer(h, 'pointerdown', 100)
    await handle(m, 'age').trigger('keydown', { key: 'ArrowRight' })
    await handle(m, 'age').trigger('keydown', { key: 'Escape' })
    pointer(h, 'pointerup', 180)
    expect(resized(m)).toEqual([])
  })

  it('ignores other buttons, other pointers and a second press', () => {
    const { m, h } = start()
    pointer(h, 'pointerdown', 100, { button: 2 })
    pointer(h, 'pointerup', 150)
    expect(resized(m)).toEqual([])
    pointer(h, 'pointerdown', 100)
    pointer(h, 'pointerdown', 300, { pointerId: 2 })
    pointer(h, 'pointermove', 400, { pointerId: 2 })
    pointer(h, 'pointerup', 400, { pointerId: 2 })
    expect(resized(m)).toEqual([])
    pointer(h, 'pointerup', 130)
    expect(resized(m)).toEqual([{ field: 'age', width: 130 }])
  })

  it('a pending preview frame never runs after the drag ends or the table unmounts', async () => {
    const { m, h, th } = start()
    pointer(h, 'pointerdown', 100)
    pointer(h, 'pointermove', 150)
    pointer(h, 'pointercancel', 150)
    await nextFrame()
    await m.wrapper.vm.$nextTick()
    expect(th.style.width).toBe('')
    pointer(h, 'pointerdown', 100)
    pointer(h, 'pointermove', 150)
    m.wrapper.unmount()
    mounted = null
    await nextFrame()
    expect(resized(m)).toEqual([])
  })

  it('a click on the handle stays in the handle', async () => {
    const { m } = start()
    const outer = vi.fn()
    m.wrapper
      .find('th[data-field="age"]')
      .element.addEventListener('click', outer)
    await handle(m, 'age').trigger('click')
    expect(outer).not.toHaveBeenCalled()
  })
})

describe('C-50 Keyboard and autofit', () => {
  it('steps by 10 pixels, 50 with Shift, from the rendered width', async () => {
    headerWidth(100)
    const m = mountIt({ columns: columns(), resizable: true })
    const h = handle(m, 'name')
    await h.trigger('keydown', { key: 'ArrowRight' })
    await h.trigger('keydown', { key: 'ArrowLeft' })
    await h.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    await h.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect(resized(m)).toEqual([
      { field: 'name', width: 110 },
      { field: 'name', width: 90 },
      { field: 'name', width: 150 },
      { field: 'name', width: 60 }
    ])
  })

  it('emits nothing when the clamped width equals the rendered one', async () => {
    headerWidth(300)
    const m = mountIt({ columns: columns(), resizable: true })
    await handle(m, 'name').trigger('keydown', { key: 'ArrowRight' })
    await handle(m, 'name').trigger('keydown', { key: 'Tab' })
    expect(resized(m)).toEqual([])
  })

  it('fits the column to its widest content on Enter and on a double click', async () => {
    headerWidth(100)
    // The content of the header label and of every body cell: 123.4 px.
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ width: 123.4 }) as DOMRect
    )
    const m = mountIt({
      columns: columns(),
      rows: [
        { id: 1, name: 'A', age: 1 },
        { id: 2, name: 'B', age: 2 }
      ],
      resizable: true,
      filterable: true
    })
    await handle(m, 'age').trigger('keydown', { key: 'Enter' })
    await handle(m, 'age').trigger('dblclick')
    // Clamped to maxWidth for Name.
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ width: 500 }) as DOMRect
    )
    await handle(m, 'name').trigger('dblclick')
    expect(resized(m)).toEqual([
      { field: 'age', width: 124 },
      { field: 'age', width: 124 },
      { field: 'name', width: 300 }
    ])
  })

  it('ignores other keys and draws aria-valuemax from the table width without maxWidth', async () => {
    headerWidth(100)
    const m = mountIt({ columns: columns(), resizable: true })
    await handle(m, 'age').trigger('keydown', { key: 'a' })
    expect(resized(m)).toEqual([])
    expect(
      Number(handle(m, 'age').attributes('aria-valuemax'))
    ).toBeGreaterThanOrEqual(
      Number(handle(m, 'age').attributes('aria-valuenow'))
    )
  })

  it('keeps no width: the column shows Column.width again', async () => {
    headerWidth(100)
    const m = mountIt({
      columns: [{ field: 'name', title: 'Name', width: '100px' }],
      resizable: true
    })
    await handle(m, 'name').trigger('keydown', { key: 'ArrowRight' })
    const th = m.wrapper.find('th[data-field="name"]').element as HTMLElement
    expect(th.style.width).toBe('100px')
  })
})
