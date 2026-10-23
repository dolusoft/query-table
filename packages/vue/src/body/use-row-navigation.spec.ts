import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'

import type { RowFocusPayload, RowNavigationOptions } from '../contract'
import type { BodyRow } from '../use-query-table'
import { useRowNavigation } from './use-row-navigation'

// C-109 to C-111 without a layout: the moves, the stops, a row drawn late
// (a virtual body), the focus put back and the moves that end. The
// animation frames are run by hand.

interface Row {
  id: number
}

let queue: FrameRequestCallback[] = []
const runFrames = (n = 1) => {
  for (let i = 0; i < n; i++) {
    const now = queue
    queue = []
    for (const callback of now) {
      callback(0)
    }
  }
}

beforeEach(() => {
  queue = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queue.push(callback)
    return queue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    queue = []
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const list = (count: number): BodyRow<Row>[] =>
  Array.from({ length: count }, (_, i) => ({
    row: { id: i + 1 },
    index: i,
    pinned: false
  }))

const setup = (
  options: {
    rows?: BodyRow<Row>[]
    /** The indexes drawn in the `tbody`; all by default. */
    drawn?: number[]
    rowNavigation?: boolean | RowNavigationOptions<Row>
    virtual?: boolean
    /** Without `rowKey` the key is the index; defaults to `true`. */
    rowKey?: boolean
    /** The cell of a row: a focus target, by default a button. */
    cell?: (index: number) => string
  } = {}
) => {
  const rows = shallowRef(options.rows ?? list(10))
  const rowNavigation = shallowRef<
    boolean | RowNavigationOptions<Row> | undefined
  >(options.rowNavigation ?? true)
  const busy = shallowRef(false)
  const scrollToIndex = vi.fn()
  const reveal = vi.fn()
  const focused: Array<RowFocusPayload<Row>> = []
  const tableEl = shallowRef<HTMLTableElement | null>(null)
  const cell =
    options.cell ??
    ((i: number) => `<button type="button" data-row>row ${i}</button>`)
  let api: ReturnType<typeof useRowNavigation<Row>> | null = null
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useRowNavigation<Row>({
          rowNavigation: () => rowNavigation.value,
          table: tableEl,
          bodyRows: () => rows.value,
          keyOf: (row, index) => (options.rowKey === false ? index : row.id),
          hasRowKey: () => options.rowKey !== false,
          virtual: () => options.virtual ?? false,
          scrollToIndex,
          reveal,
          busy: () => busy.value,
          onFocus: payload => focused.push(payload)
        })
        return () => h('table', { ref: tableEl }, [h('tbody')])
      }
    }),
    { attachTo: document.body }
  )
  const tbody = () => tableEl.value!.tBodies[0]
  /** Draws these indexes in the `tbody`, as the body would. */
  const draw = (indexes: number[]) => {
    tbody().innerHTML = indexes
      .map(i => {
        const item = rows.value.find(r => r.index === i)
        const pinned = item?.pinned ? ` data-pinned-row="${item.pinned}"` : ''
        return `<tr data-row-index="${i}"${pinned}><td>${cell(i)}</td></tr>`
      })
      .join('')
  }
  draw(options.drawn ?? rows.value.map(r => r.index))
  tbody().addEventListener('keydown', event => api!.onKeyDown(event))
  const targetOf = (index: number) =>
    tbody().querySelector<HTMLElement>(
      `tr[data-row-index="${index}"] button, tr[data-row-index="${index}"] input`
    )
  /** Presses a key on the focused element; returns whether it was prevented. */
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init
    })
    ;(document.activeElement ?? document.body).dispatchEvent(event)
    return event.defaultPrevented
  }
  const focusedIndex = () => {
    const tr = document.activeElement?.closest('tr')
    return tr ? Number(tr.getAttribute('data-row-index')) : null
  }
  return {
    api: api!,
    wrapper,
    rows,
    rowNavigation,
    busy,
    scrollToIndex,
    reveal,
    focused,
    draw,
    tbody,
    targetOf,
    press,
    focusedIndex
  }
}

describe('C-109 use-row-navigation', () => {
  it('moves to the next and previous row, emits once per move and shows the row', () => {
    const t = setup()
    t.targetOf(0)!.focus()
    expect(t.press('ArrowDown')).toBe(true)
    expect(t.focusedIndex()).toBe(1)
    expect(t.press('ArrowUp')).toBe(true)
    expect(t.focusedIndex()).toBe(0)
    expect(t.focused.map(f => [f.rowIndex, f.row.id, f.key])).toEqual([
      [1, 2, 'ArrowDown'],
      [0, 1, 'ArrowUp']
    ])
    expect(t.reveal.mock.calls).toEqual([[1], [0]])
    // The focus stays: the move is done after a few frames, no new event.
    runFrames(5)
    expect(t.focused).toHaveLength(2)
    expect(queue).toEqual([])
  })

  it('Home and End go to the ends; at an end the key is prevented and nothing moves', () => {
    const t = setup()
    t.targetOf(4)!.focus()
    t.press('End')
    expect(t.focusedIndex()).toBe(9)
    expect(t.press('ArrowDown')).toBe(true)
    expect(t.press('End')).toBe(true)
    expect(t.focusedIndex()).toBe(9)
    t.press('Home')
    expect(t.focusedIndex()).toBe(0)
    expect(t.press('ArrowUp')).toBe(true)
    expect(t.focused.map(f => f.rowIndex)).toEqual([9, 0])
  })

  it('passes over the rows skip names, at the ends too', () => {
    const skip = vi.fn((row: Row) => row.id % 2 === 1)
    const t = setup({ rowNavigation: { skip } })
    t.targetOf(1)!.focus()
    t.press('ArrowDown')
    expect(t.focusedIndex()).toBe(3)
    t.press('Home')
    expect(t.focusedIndex()).toBe(1)
    t.press('End')
    expect(t.focusedIndex()).toBe(9)
    // Nothing above the first stop.
    t.press('Home')
    expect(t.press('ArrowUp')).toBe(true)
    expect(t.focusedIndex()).toBe(1)
    expect(skip).toHaveBeenCalledWith({ id: 3 }, 2)
  })

  it('acts only on the focus target, without a modifier, a composition or a prevented default', () => {
    const t = setup({
      rowNavigation: { focus: '[data-row]' },
      cell: i =>
        `<input type="checkbox"><button type="button" data-row>row ${i}</button>`
    })
    const checkbox = t.tbody().querySelector<HTMLElement>('input')!
    checkbox.focus()
    expect(t.press('ArrowDown')).toBe(false)
    t.tbody().querySelector<HTMLElement>('[data-row]')!.focus()
    for (const init of [
      { shiftKey: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { isComposing: true }
    ]) {
      expect(t.press('ArrowDown', init)).toBe(false)
    }
    expect(t.press('PageDown')).toBe(false)
    const prevented = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true
    })
    prevented.preventDefault()
    document.activeElement!.dispatchEvent(prevented)
    expect(t.focusedIndex()).toBe(0)
    expect(t.focused).toEqual([])
  })

  it('the default target is never a control that uses the arrow keys', () => {
    const t = setup({
      cell: i =>
        `<input type="text"><select><option>a</option></select><input type="radio"><textarea></textarea><button type="button" data-i="${i}">row ${i}</button>`
    })
    const button = (i: number) =>
      t.tbody().querySelector<HTMLElement>(`button[data-i="${i}"]`)!
    // A text field keeps its keys.
    t.tbody().querySelector<HTMLElement>('input[type="text"]')!.focus()
    expect(t.press('ArrowDown')).toBe(false)
    button(0).focus()
    t.press('ArrowDown')
    expect(document.activeElement).toBe(button(1))
  })

  it('the default target is the first focusable element of the row', () => {
    const t = setup({
      cell: i =>
        `<button type="button" disabled>off</button><input type="checkbox" data-i="${i}"><button type="button">row ${i}</button>`
    })
    const checkbox = (i: number) =>
      t.tbody().querySelector<HTMLElement>(`input[data-i="${i}"]`)!
    checkbox(0).focus()
    t.press('ArrowDown')
    expect(document.activeElement).toBe(checkbox(1))
  })

  it('a key in a row of a table nested in a cell is not this table’s', () => {
    const t = setup()
    const inner = document.createElement('table')
    inner.innerHTML =
      '<tbody><tr data-row-index="0"><td><button type="button">inner</button></td></tr></tbody>'
    t.tbody().querySelector('tr[data-row-index="0"] td')!.append(inner)
    inner.querySelector('button')!.focus()
    // The row of the outer body holds it, but its target is the outer button.
    expect(t.press('ArrowDown')).toBe(false)
    // An element outside any row of the body.
    const loose = document.createElement('button')
    t.tbody().append(loose)
    loose.focus()
    expect(t.press('ArrowDown')).toBe(false)
  })

  it('a row with no focus target ends the move where it is', () => {
    const t = setup({
      cell: i =>
        i === 2 ? 'text' : `<button type="button" data-row>row ${i}</button>`
    })
    t.targetOf(1)!.focus()
    t.press('ArrowDown')
    expect(t.focusedIndex()).toBe(1)
    expect(t.focused).toEqual([])
    expect(queue).toEqual([])
  })

  it('a focus that does not take ends the move after its frames', () => {
    const t = setup()
    t.targetOf(0)!.focus()
    const next = t.targetOf(1)!
    next.focus = () => undefined
    t.press('ArrowDown')
    expect(t.focusedIndex()).toBe(0)
    runFrames(40)
    expect(queue).toEqual([])
    expect(t.focused).toEqual([])
  })

  it('a row whose index is not in the rows given does nothing', () => {
    const t = setup()
    t.tbody().innerHTML +=
      '<tr data-row-index="42"><td><button type="button" id="ghost">x</button></td></tr>'
    document.querySelector<HTMLElement>('#ghost')!.focus()
    expect(t.press('ArrowDown')).toBe(false)
  })

  it('off, nothing: the keys pass and no frame is asked for', () => {
    const t = setup({ rowNavigation: false })
    expect(t.api.enabled()).toBe(false)
    t.targetOf(0)!.focus()
    expect(t.press('ArrowDown')).toBe(false)
    expect(t.focusedIndex()).toBe(0)
    expect(queue).toEqual([])
  })
})

describe('C-110 use-row-navigation', () => {
  it('a row out of the window is scrolled to, then focused by its key once drawn', () => {
    const t = setup({ rows: list(100), drawn: [0, 1, 2], virtual: true })
    t.targetOf(0)!.focus()
    t.press('End')
    expect(t.scrollToIndex).toHaveBeenCalledWith(99, { align: 'auto' })
    expect(t.focusedIndex()).toBe(0)
    // The window is still busy: nothing is focused yet.
    t.busy.value = true
    runFrames(2)
    expect(t.focusedIndex()).toBe(0)
    t.busy.value = false
    t.draw([97, 98, 99])
    runFrames()
    expect(t.focusedIndex()).toBe(99)
    expect(t.focused.map(f => [f.rowIndex, f.key])).toEqual([[99, 'End']])
  })

  it('goes by key: rows added before the row is drawn do not move it', () => {
    const t = setup({ rows: list(100), drawn: [0, 1], virtual: true })
    t.targetOf(0)!.focus()
    t.press('End')
    // Two rows come in at the top; the window dropped the scroll (C-87).
    t.rows.value = [
      { row: { id: 500 }, index: 0, pinned: false },
      { row: { id: 501 }, index: 1, pinned: false },
      ...list(100).map(r => ({ ...r, index: r.index + 2 }))
    ]
    t.scrollToIndex.mockClear()
    runFrames()
    // Asked again, for the new index of the same row.
    expect(t.scrollToIndex).toHaveBeenCalledWith(101, { align: 'auto' })
    t.draw([100, 101])
    runFrames()
    expect(t.focusedIndex()).toBe(101)
    expect(t.focused.map(f => [f.rowIndex, f.row.id])).toEqual([[101, 100]])
  })

  it('without rowKey the move finds its row by its object, not by the index it had', () => {
    const t = setup({
      rows: list(100),
      drawn: [0, 1],
      virtual: true,
      rowKey: false
    })
    t.targetOf(0)!.focus()
    t.press('End')
    const last = t.rows.value[99].row
    t.rows.value = [
      { row: { id: 500 }, index: 0, pinned: false },
      ...t.rows.value.map(r => ({ ...r, index: r.index + 1 }))
    ]
    t.draw([99, 100])
    runFrames()
    expect(t.focusedIndex()).toBe(100)
    expect(t.focused.map(f => f.row)).toEqual([last])
  })

  it('a pointerdown anywhere ends a waiting move', () => {
    const t = setup({ rows: list(100), drawn: [0, 1], virtual: true })
    t.targetOf(0)!.focus()
    t.press('End')
    // A click on empty space: the focus goes to the body.
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    ;(document.activeElement as HTMLElement).blur()
    t.draw([98, 99])
    runFrames(3)
    expect(document.activeElement).toBe(document.body)
    expect(t.focused).toEqual([])
    expect(queue).toEqual([])
  })

  it('the frames that keep the focus are counted while the window is idle', () => {
    const t = setup()
    t.targetOf(0)!.focus()
    t.press('ArrowDown')
    t.busy.value = true
    runFrames(5)
    // Still watching: a focus dropped now is put back.
    expect(queue).toHaveLength(1)
    ;(document.activeElement as HTMLElement).blur()
    t.busy.value = false
    runFrames()
    expect(t.focusedIndex()).toBe(1)
    runFrames(3)
    expect(queue).toEqual([])
    expect(t.focused).toHaveLength(1)
  })

  it('a key pressed while a move waits moves on from the row it waits for', () => {
    const t = setup({ rows: list(100), drawn: [0, 1], virtual: true })
    t.targetOf(0)!.focus()
    t.press('End')
    expect(t.press('ArrowUp')).toBe(true)
    expect(t.scrollToIndex).toHaveBeenLastCalledWith(98, { align: 'auto' })
    t.draw([97, 98, 99])
    runFrames()
    expect(t.focusedIndex()).toBe(98)
    expect(t.focused.map(f => [f.rowIndex, f.key])).toEqual([[98, 'ArrowUp']])
  })

  it('a pinned row is drawn: it is focused, not scrolled to', () => {
    const rows = list(5)
    rows[0] = { ...rows[0], pinned: 'top' }
    const t = setup({ rows, virtual: true })
    t.targetOf(1)!.focus()
    t.press('ArrowUp')
    expect(t.focusedIndex()).toBe(0)
    expect(t.scrollToIndex).not.toHaveBeenCalled()
  })

  it('puts back a focus that moving nodes dropped, without a second event', () => {
    const t = setup()
    t.targetOf(0)!.focus()
    t.press('ArrowDown')
    ;(document.activeElement as HTMLElement).blur()
    runFrames()
    expect(t.focusedIndex()).toBe(1)
    runFrames(4)
    expect(t.focused).toHaveLength(1)
    expect(t.reveal).toHaveBeenCalledTimes(1)
  })

  it('ends when the focus goes to another element', () => {
    const t = setup({ rows: list(100), drawn: [0, 1], virtual: true })
    const outside = document.createElement('input')
    document.body.append(outside)
    t.targetOf(0)!.focus()
    t.press('End')
    outside.focus()
    t.draw([98, 99])
    runFrames()
    expect(document.activeElement).toBe(outside)
    expect(queue).toEqual([])
  })

  it('ends when its row leaves the rows, or the body does', () => {
    const t = setup({ rows: list(100), drawn: [0, 1], virtual: true })
    t.targetOf(0)!.focus()
    t.press('End')
    t.rows.value = list(10)
    runFrames()
    expect(queue).toEqual([])
    expect(t.focused).toEqual([])
    t.press('End')
    expect(queue).toHaveLength(1)
    t.wrapper.unmount()
    expect(queue).toEqual([])
    expect(t.focused).toEqual([])
  })

  it('gives up a row that is never drawn', () => {
    const t = setup({ rows: list(100), drawn: [0, 1], virtual: true })
    t.targetOf(0)!.focus()
    t.press('End')
    runFrames(40)
    expect(queue).toEqual([])
    expect(t.focusedIndex()).toBe(0)
  })
})
