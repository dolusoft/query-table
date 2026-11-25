import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'

import type {
  QueryChangeReason,
  RowReorderPayload
} from '@dolusoft/query-table'
import { DataTable } from '@dolusoft/query-table/data-table'

import {
  makeColumns,
  makeQuery,
  makeRows,
  mountTable,
  type Mounted,
  type Row
} from '../../support/mount-table'

// C-133 without a layout engine: every body row is a 40px box at its place
// in the `tbody`, and `elementFromPoint` reads that; the pointer capture is
// a no-op. The browser spec (`row-reorder.browser.spec.ts`) drags in a real
// layout.

const rowHeight = 40
let mounted: Mounted | null = null

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(
    () => undefined
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const siblings = [...(this.parentElement?.children ?? [])]
      const top = Math.max(0, siblings.indexOf(this)) * rowHeight
      return { top, bottom: top + rowHeight, height: rowHeight } as DOMRect
    }
  )
  vi.spyOn(document, 'elementFromPoint').mockImplementation(
    (_x: number, y: number) =>
      document.querySelector('.qt-table > tbody')?.children[
        Math.floor(y / rowHeight)
      ]?.firstElementChild ?? null
  )
})

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
  vi.restoreAllMocks()
})

/** A consumer that puts the moved row in its new place, unless told not to. */
const mountIt = (
  props: Record<string, unknown> = {},
  options: { writeBack?: boolean; slots?: Record<string, string> } = {}
) => {
  const moves: Array<RowReorderPayload<Row>> = []
  const m: Mounted = mountTable(
    {
      rowKey: 'id',
      rowReorderable: true,
      onRowReorder: (move: RowReorderPayload<Row>) => {
        moves.push(move)
        if (options.writeBack !== false) {
          const list = (m.wrapper.props() as { rows: Row[] }).rows
          const moved = list.find(row => row.id === move.rowKey)!
          const rest = list.filter(row => row !== moved)
          const at = rest.findIndex(row => row.id === move.target)
          rest.splice(move.place === 'before' ? at : at + 1, 0, moved)
          void m.wrapper.setProps({ rows: rest })
        }
      },
      ...props
    },
    { slots: options.slots }
  )
  mounted = m
  return { m, moves }
}

const bodyRows = (m: Mounted) => m.wrapper.findAll('tbody > tr[data-row-index]')
const ids = (m: Mounted) =>
  bodyRows(m).map(tr => Number(tr.find('td[data-field="id"]').text()))
const handleOf = (m: Mounted, id: number) =>
  bodyRows(m)
    .find(tr => tr.find('td[data-field="id"]').text() === String(id))!
    .find('.qt-row-reorder-handle').element as HTMLElement
const marks = (m: Mounted) => ({
  dragging: m.wrapper
    .findAll('tbody > tr[data-dragging]')
    .map(tr => Number(tr.find('td[data-field="id"]').text())),
  drop: m.wrapper
    .findAll('tbody > tr[data-drop]')
    .map(
      tr =>
        `${tr.find('td[data-field="id"]').text()}:${tr.attributes('data-drop')}`
    )
})
const pointer = (el: Element, type: string, clientY: number) =>
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      button: 0,
      clientX: 5,
      clientY
    })
  )
const key = (el: Element, name: string) => {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true
  })
  el.dispatchEvent(event)
  return event.defaultPrevented
}
const tick = (m: Mounted) => m.wrapper.vm.$nextTick()

describe('C-133 Row reorder handle (unit) [own]', () => {
  it('draws the handle column first, only with rowReorderable and rowKey', async () => {
    const { m } = mountIt({ hasRightPanel: true, selection: {} })
    const first = bodyRows(m)[0].findAll('td')
    expect(first[0].find('button.qt-row-reorder-handle').exists()).toBe(true)
    expect(first[1].find('.qt-right-panel-button').exists()).toBe(true)
    expect(first[2].find('.qt-select-row').exists()).toBe(true)
    const handle = first[0].find('button')
    expect(handle.attributes()).toMatchObject({
      type: 'button',
      'aria-label': 'Move row',
      'aria-keyshortcuts': 'ArrowUp ArrowDown Home End'
    })
    // The header cell of the column is an empty `td`.
    const header = m.wrapper.findAll('thead > tr > *')
    expect(header[0].element.tagName).toBe('TD')
    expect(header[0].element.children).toHaveLength(0)

    await m.wrapper.setProps({ rowReorderable: false })
    expect(m.wrapper.find('.qt-row-reorder-handle').exists()).toBe(false)
    expect(
      bodyRows(m)[0].findAll('td')[0].find('.qt-right-panel-button').exists()
    ).toBe(true)
    // Off, the row draws no placeholder the markup shows (C-108): the one
    // comment is the expand column's, as in 3.10.
    expect(bodyRows(m)[0].element.innerHTML.split('<!---->')).toHaveLength(2)
    // On again: the handle comes back in front, the other cells stay.
    await m.wrapper.setProps({ rowReorderable: true })
    const again = bodyRows(m)[0].findAll('td')
    expect(again[0].find('.qt-row-reorder-handle').exists()).toBe(true)
    expect(again[1].find('.qt-right-panel-button').exists()).toBe(true)
    expect(m.wrapper.findAll('.qt-row-reorder-handle')).toHaveLength(5)
  })

  it('names the handle with labels.moveRow', () => {
    const { m } = mountIt({ labels: { moveRow: 'Satırı taşı' } })
    expect(handleOf(m, 1).getAttribute('aria-label')).toBe('Satırı taşı')
  })

  it('a pinned row has an empty handle cell', () => {
    const { m } = mountIt({ rowPinning: { top: ['3'], bottom: [] } })
    const pinned = bodyRows(m)[0]
    expect(pinned.attributes('data-pinned-row')).toBe('top')
    expect(pinned.findAll('td')[0].element.children).toHaveLength(0)
    expect(m.wrapper.findAll('.qt-row-reorder-handle')).toHaveLength(4)
  })

  it('marks the dragged row and the drop target, and emits one move on release', async () => {
    const { m, moves } = mountIt()
    const handle = handleOf(m, 1)
    pointer(handle, 'pointerdown', 10)
    await tick(m)
    expect(marks(m)).toEqual({ dragging: [1], drop: [] })
    pointer(handle, 'pointermove', 2 * rowHeight + 30)
    await tick(m)
    expect(marks(m)).toEqual({ dragging: [1], drop: ['3:after'] })
    expect(moves).toEqual([])
    pointer(handle, 'pointerup', 0)
    await tick(m)
    await tick(m)
    expect(moves).toEqual([
      {
        row: makeRows()[0],
        rowIndex: 0,
        rowKey: 1,
        target: 3,
        place: 'after'
      }
    ])
    expect(ids(m)).toEqual([2, 3, 1, 4, 5])
    expect(marks(m)).toEqual({ dragging: [], drop: [] })
    expect(m.events).toEqual([])
  })

  it('keys move the row and the focus stays on its handle', async () => {
    const { m, moves } = mountIt()
    const handle = handleOf(m, 2)
    handle.focus()
    expect(key(handle, 'ArrowDown')).toBe(true)
    await tick(m)
    await tick(m)
    expect(ids(m)).toEqual([1, 3, 2, 4, 5])
    expect(document.activeElement).toBe(handleOf(m, 2))
    expect(key(handleOf(m, 2), 'Home')).toBe(true)
    await tick(m)
    await tick(m)
    expect(ids(m)).toEqual([2, 1, 3, 4, 5])
    expect(
      moves.map(move => `${move.rowKey}>${move.place}:${move.target}`)
    ).toEqual(['2>after:3', '2>before:1'])
    expect(m.events).toEqual([])
  })

  it('the icon-reorder slot replaces the grip of a row handle', async () => {
    const { m } = mountIt(
      {},
      { slots: { 'icon-reorder': '<i class="grip" />' } }
    )
    const handle = handleOf(m, 1)
    expect(handle.querySelector('i.grip')).not.toBeNull()
    expect(handle.querySelector('svg')).toBeNull()
    expect(handle.getAttribute('aria-label')).toBe('Move row')
  })

  it('the row navigation does not take the handle as the focus target (C-109)', () => {
    const { m } = mountIt({ rowNavigation: true, hasSubtable: true })
    const row = bodyRows(m)[0].element
    const expand = row.querySelector<HTMLElement>('.qt-expand')!
    expand.focus()
    expect(key(expand, 'ArrowDown')).toBe(true)
    expect(document.activeElement).toBe(
      bodyRows(m)[1].element.querySelector('.qt-expand')
    )
  })

  it('without rowKey there is no handle and the table warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { m } = mountIt({ rowKey: undefined })
    expect(m.wrapper.find('.qt-row-reorder-handle').exists()).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('C-133 DataTable passes the row handle on (unit) [own]', () => {
  it('draws the handles over the rows it draws and emits rowReorder', async () => {
    const moves: Array<RowReorderPayload<Row>> = []
    const updates: QueryChangeReason[] = []
    const wrapper = mount(DataTable as unknown as Component, {
      props: {
        // The dataset keys rows by an integer or string field (C-126).
        columns: makeColumns().map(column =>
          column.field === 'id' ? { ...column, type: 'integer' } : column
        ),
        rows: makeRows(),
        rowKey: 'id',
        rowReorderable: true,
        sortable: true,
        query: makeQuery({ sort: { field: 'id', direction: 'desc' } }),
        onRowReorder: (move: RowReorderPayload<Row>) => moves.push(move),
        'onUpdate:query': (_q: unknown, reason: QueryChangeReason) =>
          updates.push(reason)
      },
      attachTo: document.body
    })
    await nextTick()
    const handles = wrapper.findAll('.qt-row-reorder-handle')
    expect(handles).toHaveLength(5)
    // Sorted by id descending, the first row drawn is id 5, index 0.
    key(handles[0].element, 'ArrowDown')
    expect(moves).toEqual([
      {
        row: makeRows()[4],
        rowIndex: 0,
        rowKey: 5,
        target: 4,
        place: 'after'
      }
    ])
    expect(updates).toEqual([])
    wrapper.unmount()
  })
})
