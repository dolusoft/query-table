import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

import type { Column, HeaderContextMenuPayload } from '@dolusoft/query-table'

import { makeColumns, mountTable, propsOf, type Mounted } from '../../support/mount-table'

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

const rightClick = (target: Element) => {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true
  })
  target.dispatchEvent(event)
  return event
}

describe('C-96 Header context menu', () => {
  // The table answers right clicks only for a consumer that listens.
  const listen = { onHeaderContextMenu: () => undefined }

  it('emits nothing and keeps the browser menu when nobody listens', () => {
    const m = mountIt()
    const cell = m.wrapper.find('thead th[data-field="age"]')
    const event = rightClick(cell.element)
    expect(event.defaultPrevented).toBe(false)
    expect(m.wrapper.emitted('headerContextMenu')).toBeUndefined()
  })

  it('emits headerContextMenu with the payload and suppresses the browser menu', () => {
    const m = mountIt(listen)
    const cell = m.wrapper.find('thead th[data-field="age"]')
    const event = rightClick(cell.element)
    expect(event.defaultPrevented).toBe(true)
    const emitted = m.wrapper.emitted('headerContextMenu') as [
      HeaderContextMenuPayload
    ][]
    expect(emitted).toHaveLength(1)
    const payload = emitted[0][0]
    expect(payload.event).toBe(event)
    expect(payload.column).toBe(propsOf(m).columns[2])
    expect(payload.columnIndex).toBe(2)
  })

  it('treats a .once listener as a listener', () => {
    const m = mountIt({ onHeaderContextMenuOnce: () => undefined })
    const event = rightClick(
      m.wrapper.find('thead th[data-field="name"]').element
    )
    expect(event.defaultPrevented).toBe(true)
  })

  it('answers a right click on content inside a header for that column', () => {
    const m = mountIt(
      { columns: makeColumns().slice(0, 2), ...listen },
      {
        slots: {
          'header-name': () => h('b', { class: 'inner' }, 'Name')
        }
      }
    )
    const event = rightClick(m.wrapper.find('thead th .inner').element)
    expect(event.defaultPrevented).toBe(true)
    const payload = (
      m.wrapper.emitted('headerContextMenu') as [HeaderContextMenuPayload][]
    )[0][0]
    expect(payload.column.field).toBe('name')
    expect(payload.columnIndex).toBe(1)
  })

  it('emits nothing and keeps the browser menu on the filter row', () => {
    const m = mountIt({ filterable: true, ...listen })
    const input = m.wrapper.find(
      'thead th[data-field="name"] .qt-filter-input'
    )
    expect(input.exists()).toBe(true)
    const event = rightClick(input.element)
    expect(event.defaultPrevented).toBe(false)
    expect(m.wrapper.emitted('headerContextMenu')).toBeUndefined()
  })

  it('emits nothing and keeps the browser menu on utility headers', () => {
    const m = mountIt({
      filterable: true,
      hasRightPanel: true,
      selection: {},
      rowKey: 'id',
      ...listen
    })
    const targets = [
      m.wrapper.find('.qt-clear-all-button').element,
      m.wrapper.find('.qt-select-all').element
    ]
    for (const target of targets) {
      expect(rightClick(target).defaultPrevented).toBe(false)
    }
    expect(m.wrapper.emitted('headerContextMenu')).toBeUndefined()
  })

  it('columnIndex counts hidden columns, because it indexes columns', () => {
    const columns: Column[] = [
      { field: 'id', hide: true },
      { field: 'name', title: 'Name' }
    ]
    const m = mountIt({ columns, ...listen })
    rightClick(m.wrapper.find('thead th[data-field="name"]').element)
    const payload = (
      m.wrapper.emitted('headerContextMenu') as [HeaderContextMenuPayload][]
    )[0][0]
    expect(payload.columnIndex).toBe(1)
  })
})
