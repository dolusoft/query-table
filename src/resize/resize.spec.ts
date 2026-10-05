import { afterEach, describe, expect, it, vi } from 'vitest'

import { clampWidth } from './use-column-resize'
import { mountTable, type Mounted } from '../../tests/support/mount-table'
import type { Column } from '../contract'

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
  it('clamps a width to whole pixels within minWidth and maxWidth', () => {
    const column = columns()[1]
    expect(clampWidth(column, 10)).toBe(60)
    expect(clampWidth(column, 1000)).toBe(300)
    expect(clampWidth(column, 120.4)).toBe(120)
    expect(clampWidth({ field: 'x' }, 3)).toBe(40)
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
