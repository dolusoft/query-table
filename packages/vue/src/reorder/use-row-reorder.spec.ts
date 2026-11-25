import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, shallowRef, watch } from 'vue'

import type { RowReorderPayload } from '../contract'
import type { BodyRow } from '../use-query-table'
import {
  rowHandleClass,
  useRowReorder,
  type RowHandleListeners,
  type RowReorder
} from './use-row-reorder'

// C-133 without a layout: the body is built by hand, every `tr` is 40px
// tall at its place in the `tbody`, and `elementFromPoint` reads that. The
// browser spec (`tests/contract/browser/row-reorder.browser.spec.ts`) drags
// in a real layout.

interface Row {
  id: number
}

const rowHeight = 40
let wrapper: VueWrapper | null = null

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const siblings = [...(this.parentElement?.children ?? [])]
      const top = Math.max(0, siblings.indexOf(this)) * rowHeight
      return {
        top,
        bottom: top + rowHeight,
        height: rowHeight,
        left: 0,
        right: 100,
        width: 100
      } as DOMRect
    }
  )
  vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(
    () => undefined
  )
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  document.body.innerHTML = ''
})

interface Options {
  count?: number
  /** Pinned rows by id. */
  pinned?: Record<number, 'top' | 'bottom'>
  /** The indexes in `rows` drawn in the `tbody`; all by default. */
  drawn?: number[]
  /** Ids whose open subtable row follows them. */
  open?: number[]
  virtual?: boolean
  rowKey?: boolean
  rowReorderable?: boolean
}

const setup = (options: Options = {}) => {
  const rows = shallowRef<Row[]>(
    Array.from({ length: options.count ?? 5 }, (_, i) => ({ id: i + 1 }))
  )
  const pinned = shallowRef(options.pinned ?? {})
  const reorderable = shallowRef(options.rowReorderable ?? true)
  const drawnIds = shallowRef<number[] | null>(options.drawn ?? null)
  const bodyRows = computed<BodyRow<Row>[]>(() => {
    const all = rows.value.map((row, index) => ({
      row,
      index,
      pinned: pinned.value[row.id] ?? (false as const)
    }))
    return [
      ...all.filter(item => item.pinned === 'top'),
      ...all.filter(item => !item.pinned),
      ...all.filter(item => item.pinned === 'bottom')
    ]
  })
  const table = document.createElement('table')
  const tbody = table.createTBody()
  document.body.append(table)
  const moves: Array<RowReorderPayload<Row>> = []
  const scrollToIndex = vi.fn()
  const reveal = vi.fn()
  const ref = shallowRef<HTMLTableElement | null>(table)
  let api!: RowReorder
  const listeners = new Map<number, RowHandleListeners>()

  let beforeDraw: (() => void) | null = null
  /** Draws the body as the table would: the drawn rows, handles, subtables. */
  const draw = () => {
    beforeDraw?.()
    tbody.replaceChildren()
    for (const item of bodyRows.value) {
      const id = item.row.id
      if (drawnIds.value && !drawnIds.value.includes(item.index)) {
        continue
      }
      const tr = tbody.insertRow()
      tr.dataset.rowIndex = String(item.index)
      tr.dataset.id = String(id)
      const td = tr.insertCell()
      if (item.pinned) {
        tr.dataset.pinnedRow = item.pinned
      } else {
        const button = document.createElement('button')
        button.className = rowHandleClass
        let on = listeners.get(id)
        if (!on) {
          on = api.listeners(() => id)
          listeners.set(id, on)
        }
        button.addEventListener('pointerdown', on.onPointerdown)
        button.addEventListener('keydown', on.onKeydown)
        button.addEventListener('blur', on.onBlur)
        td.append(button)
      }
      if (options.open?.includes(id)) {
        const sub = tbody.insertRow()
        sub.className = 'qt-subtable-row'
        sub.insertCell()
      }
    }
  }

  vi.spyOn(document, 'elementFromPoint').mockImplementation(
    (_x: number, y: number) =>
      (tbody.children[Math.floor(y / rowHeight)]?.firstElementChild ??
        null) as Element | null
  )

  const Host = defineComponent({
    setup() {
      api = useRowReorder<Row>({
        rowReorderable: () => reorderable.value,
        hasRowKey: () => options.rowKey ?? true,
        table: ref,
        rows: () => rows.value,
        bodyRows: () => bodyRows.value,
        keyOf: row => row.id,
        virtual: () => options.virtual ?? false,
        scrollToIndex,
        reveal,
        drawn: () => drawnIds.value,
        onMove: payload => moves.push(payload)
      })
      // The body is drawn after the pre watchers and before the post ones,
      // as the table's render is.
      watch([rows, pinned, drawnIds], draw, { immediate: true })
      return () => h('div')
    }
  })
  wrapper = mount(Host)

  const handleOf = (id: number) =>
    tbody.querySelector<HTMLElement>(`tr[data-id="${id}"] .${rowHandleClass}`)!
  const rowTop = (id: number) =>
    [...tbody.children].indexOf(tbody.querySelector(`tr[data-id="${id}"]`)!) *
    rowHeight
  const pointer = (
    target: Element,
    type: string,
    y: number,
    init: PointerEventInit = {}
  ) =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        button: 0,
        clientX: 10,
        clientY: y,
        ...init
      })
    )
  /** Moves over a half of a row by id. */
  const over = (handle: Element, id: number, half: 'before' | 'after') =>
    pointer(handle, 'pointermove', rowTop(id) + (half === 'before' ? 5 : 35))
  const key = (target: Element, name: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: name,
      bubbles: true,
      cancelable: true,
      ...init
    })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }
  /** Writes a move back as a consumer does. */
  const writeBack = async (move: RowReorderPayload<Row>) => {
    const list = rows.value
    const moved = list.find(row => row.id === move.rowKey)!
    const rest = list.filter(row => row !== moved)
    const at = rest.findIndex(row => row.id === move.target)
    rest.splice(move.place === 'before' ? at : at + 1, 0, moved)
    rows.value = rest
    await nextTick()
  }

  return {
    api: () => api,
    rows,
    pinned,
    reorderable,
    drawnIds,
    tbody,
    moves,
    scrollToIndex,
    reveal,
    draw,
    beforeDraw: (hook: (() => void) | null) => {
      beforeDraw = hook
    },
    handleOf,
    pointer,
    over,
    key,
    writeBack,
    moved: () => moves.map(m => `${m.rowKey}>${m.place}:${m.target}`)
  }
}

describe('useRowReorder: drag (C-133)', () => {
  it('previews the drop by key and half, and emits one move on release', () => {
    const t = setup()
    const handle = t.handleOf(1)
    t.pointer(handle, 'pointerdown', 10)
    expect(document.activeElement).toBe(handle)
    expect(t.api().dragging.value).toEqual({
      key: 1,
      target: null,
      place: 'after'
    })
    t.over(handle, 3, 'after')
    expect(t.api().dragging.value).toEqual({
      key: 1,
      target: 3,
      place: 'after'
    })
    const same = t.api().dragging.value
    t.over(handle, 3, 'after')
    expect(t.api().dragging.value).toBe(same)
    t.over(handle, 2, 'before')
    expect(t.api().dragging.value).toMatchObject({ target: 2, place: 'before' })
    expect(t.moves).toEqual([])
    t.over(handle, 4, 'before')
    t.pointer(handle, 'pointerup', 0)
    expect(t.api().dragging.value).toBeNull()
    expect(t.moves).toEqual([
      { row: { id: 1 }, rowIndex: 0, rowKey: 1, target: 4, place: 'before' }
    ])
  })

  it('emits nothing where the order stays, over its own row or over no row', () => {
    const t = setup()
    const handle = t.handleOf(3)
    const drop = (id: number | null, half: 'before' | 'after') => {
      t.pointer(handle, 'pointerdown', 10)
      if (id === null) {
        t.pointer(handle, 'pointermove', 1000)
      } else {
        t.over(handle, id, half)
      }
      t.pointer(handle, 'pointerup', 0)
    }
    drop(2, 'after')
    drop(4, 'before')
    drop(3, 'after')
    drop(null, 'after')
    expect(t.moves).toEqual([])
  })

  it('over a subtable row the row goes after the row it belongs to', () => {
    const t = setup({ open: [2] })
    const handle = t.handleOf(4)
    t.pointer(handle, 'pointerdown', 10)
    // The subtable row of row 2 is the third `tr`.
    t.pointer(handle, 'pointermove', 2 * rowHeight + 5)
    expect(t.api().dragging.value).toMatchObject({ target: 2, place: 'after' })
    t.pointer(handle, 'pointerup', 0)
    expect(t.moved()).toEqual(['4>after:2'])
  })

  it('a pinned row, a row of no index or a nested row of no body is no target', () => {
    const t = setup({ pinned: { 5: 'top' } })
    const extra = t.tbody.insertRow()
    extra.className = 'qt-group-row'
    extra.insertCell()
    const handle = t.handleOf(1)
    t.pointer(handle, 'pointerdown', 10)
    // Row 5 is pinned on top: the first `tr`.
    t.pointer(handle, 'pointermove', 5)
    expect(t.api().dragging.value).toMatchObject({ target: null })
    t.pointer(handle, 'pointermove', 5 * rowHeight + 5)
    expect(t.api().dragging.value).toMatchObject({ target: null })
    // A `tr` outside this body (another table) is none of its rows.
    const other = document.createElement('table')
    const cell = other.insertRow().insertCell()
    document.body.append(other)
    vi.mocked(document.elementFromPoint).mockReturnValueOnce(cell)
    t.pointer(handle, 'pointermove', 50)
    expect(t.api().dragging.value).toMatchObject({ target: null })
    t.pointer(handle, 'pointerup', 0)
    expect(t.moves).toEqual([])
  })

  it('a release whose target left `rows` emits nothing', async () => {
    const t = setup()
    const handle = t.handleOf(1)
    t.pointer(handle, 'pointerdown', 10)
    t.over(handle, 3, 'after')
    t.rows.value = t.rows.value.filter(row => row.id !== 3)
    await nextTick()
    t.pointer(handle, 'pointerup', 0)
    expect(t.moves).toEqual([])
  })

  it('Escape, a pointercancel and a lost capture end the drag; other pointers and keys do not', () => {
    const t = setup()
    const handle = t.handleOf(1)
    t.pointer(handle, 'pointerdown', 10)
    t.over(handle, 3, 'after')
    // Another pointer, another key: the drag goes on.
    t.pointer(handle, 'pointermove', 5, { pointerId: 2 })
    expect(t.api().dragging.value).toMatchObject({ target: 3 })
    expect(t.key(handle, 'a')).toBe(false)
    expect(t.key(handle, 'ArrowDown')).toBe(false)
    expect(t.api().dragging.value).toMatchObject({ target: 3 })
    expect(t.key(handle, 'Escape')).toBe(true)
    expect(t.api().dragging.value).toBeNull()
    t.pointer(handle, 'pointerup', 0)

    t.pointer(handle, 'pointerdown', 10)
    t.over(handle, 3, 'after')
    t.pointer(handle, 'pointercancel', 0)
    expect(t.api().dragging.value).toBeNull()

    t.pointer(handle, 'pointerdown', 10)
    t.over(handle, 3, 'after')
    handle.dispatchEvent(new PointerEvent('lostpointercapture'))
    expect(t.api().dragging.value).toBeNull()
    t.pointer(handle, 'pointerup', 0)
    expect(t.moves).toEqual([])
    // Escape without a drag is not the table's.
    expect(t.key(document.body, 'Escape')).toBe(false)
  })

  it('a lost capture of a handle no longer drawn goes on; the release still moves', async () => {
    const t = setup()
    const handle = t.handleOf(1)
    t.pointer(handle, 'pointerdown', 10)
    // A virtual body unmounts the dragged row.
    t.drawnIds.value = [2, 3, 4]
    await nextTick()
    handle.dispatchEvent(new PointerEvent('lostpointercapture'))
    expect(t.api().dragging.value).not.toBeNull()
    const target = t.tbody.children[1]
    t.pointer(target, 'pointermove', rowHeight + 35)
    t.pointer(target, 'pointerup', 0)
    expect(t.moved()).toEqual(['1>after:4'])
  })

  it('ignores a button other than the primary one and a second press', () => {
    const t = setup()
    t.pointer(t.handleOf(1), 'pointerdown', 10, { button: 2 })
    expect(t.api().dragging.value).toBeNull()
    t.pointer(t.handleOf(1), 'pointerdown', 10)
    t.pointer(t.handleOf(2), 'pointerdown', 50)
    expect(t.api().dragging.value).toMatchObject({ key: 1 })
  })

  it('a pointer the browser does not know still drags', () => {
    const t = setup()
    vi.mocked(HTMLElement.prototype.setPointerCapture).mockImplementation(
      () => {
        throw new DOMException('no pointer', 'NotFoundError')
      }
    )
    const handle = t.handleOf(1)
    t.pointer(handle, 'pointerdown', 10)
    t.over(handle, 2, 'after')
    t.pointer(handle, 'pointerup', 0)
    expect(t.moved()).toEqual(['1>after:2'])
  })

  it('unmounting during a drag leaves no listener behind', () => {
    const t = setup()
    const handle = t.handleOf(1)
    t.pointer(handle, 'pointerdown', 10)
    const drag = t.api().dragging
    wrapper!.unmount()
    wrapper = null
    expect(drag.value).toBeNull()
    t.over(handle, 3, 'after')
    t.pointer(handle, 'pointerup', 0)
    expect(t.moves).toEqual([])
  })
})

describe('useRowReorder: keys (C-133)', () => {
  it('moves one position, Home and End to the ends; the edge and pinned rows stay', () => {
    const t = setup({ pinned: { 1: 'top' } })
    expect(t.key(t.handleOf(2), 'ArrowUp')).toBe(true)
    expect(t.key(t.handleOf(5), 'ArrowDown')).toBe(true)
    expect(t.key(t.handleOf(2), 'Home')).toBe(true)
    expect(t.key(t.handleOf(5), 'End')).toBe(true)
    expect(t.moves).toEqual([])
    t.key(t.handleOf(3), 'ArrowUp')
    t.key(t.handleOf(3), 'ArrowDown')
    t.key(t.handleOf(4), 'Home')
    t.key(t.handleOf(2), 'End')
    expect(t.moved()).toEqual([
      '3>before:2',
      '3>after:4',
      '4>before:2',
      '2>after:5'
    ])
    expect(t.moves[0]).toMatchObject({ row: { id: 3 }, rowIndex: 2 })
  })

  it('leaves other keys and modifiers to the browser', () => {
    const t = setup()
    const handle = t.handleOf(2)
    expect(t.key(handle, 'Enter')).toBe(false)
    expect(t.key(handle, 'ArrowDown', { altKey: true })).toBe(false)
    expect(t.key(handle, 'Home', { ctrlKey: true })).toBe(false)
    expect(t.key(handle, 'End', { metaKey: true })).toBe(false)
    expect(t.moves).toEqual([])
  })

  it('a key of a row no longer in `rows` moves nothing', () => {
    const t = setup()
    const on = t.api().listeners(() => 99)
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      cancelable: true
    })
    on.onKeydown(event)
    expect(event.defaultPrevented).toBe(true)
    expect(t.moves).toEqual([])
  })
})

describe('useRowReorder: the focus after a key (C-133)', () => {
  it('comes back to the moved handle; the first order written back shows the row', async () => {
    const t = setup()
    t.handleOf(2).focus()
    t.key(t.handleOf(2), 'End')
    // Drawing the body again drops the focus, as moving its `tr` does.
    await t.writeBack(t.moves[0])
    expect(t.rows.value.map(row => row.id)).toEqual([1, 3, 4, 5, 2])
    expect(document.activeElement).toBe(t.handleOf(2))
    expect(t.reveal.mock.calls).toEqual([[4]])
    // A later order gives the dropped focus back, and shows nothing.
    t.rows.value = [...t.rows.value]
    await nextTick()
    expect(document.activeElement).toBe(t.handleOf(2))
    expect(t.reveal).toHaveBeenCalledTimes(1)
  })

  it('takes no focus back once the user clicked or moved the focus away', async () => {
    const t = setup()
    t.handleOf(2).focus()
    t.key(t.handleOf(2), 'ArrowDown')
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true })
    )
    t.rows.value = [...t.rows.value]
    await nextTick()
    expect(document.activeElement).toBe(document.body)

    const other = document.createElement('button')
    document.body.append(other)
    t.handleOf(3).focus()
    t.key(t.handleOf(3), 'ArrowDown')
    t.handleOf(3).dispatchEvent(
      new FocusEvent('blur', { relatedTarget: other })
    )
    t.rows.value = [...t.rows.value]
    await nextTick()
    expect(document.activeElement).toBe(document.body)
    expect(t.reveal).not.toHaveBeenCalled()
  })

  it('a blur to nowhere, or one while the new order renders, keeps it', async () => {
    const t = setup()
    t.handleOf(2).focus()
    t.key(t.handleOf(2), 'ArrowDown')
    t.handleOf(2).dispatchEvent(new FocusEvent('blur', { relatedTarget: null }))
    // While the new rows render, a blur that names an element is the move's.
    t.beforeDraw(() => {
      t.handleOf(2).dispatchEvent(
        new FocusEvent('blur', { relatedTarget: document.body })
      )
    })
    await t.writeBack(t.moves[0])
    t.beforeDraw(null)
    expect(document.activeElement).toBe(t.handleOf(2))
  })

  it('ends when the row leaves `rows` or the handles go', async () => {
    const t = setup()
    t.handleOf(2).focus()
    t.key(t.handleOf(2), 'ArrowDown')
    t.rows.value = t.rows.value.filter(row => row.id !== 2)
    await nextTick()
    t.rows.value = [...t.rows.value, { id: 2 }]
    await nextTick()
    expect(document.activeElement).toBe(document.body)

    t.handleOf(3).focus()
    t.key(t.handleOf(3), 'ArrowDown')
    t.reorderable.value = false
    t.rows.value = [...t.rows.value]
    await nextTick()
    expect(document.activeElement).toBe(document.body)
  })

  it('with `virtual` scrolls to a moved row that is not drawn, then focuses it', async () => {
    const t = setup({ virtual: true, count: 50, drawn: [0, 1, 2, 3, 4] })
    t.handleOf(2).focus()
    t.key(t.handleOf(2), 'End')
    expect(t.moved()).toEqual(['2>after:50'])
    await t.writeBack(t.moves[0])
    expect(t.scrollToIndex.mock.calls).toEqual([[49, { align: 'auto' }]])
    expect(document.activeElement).toBe(document.body)
    // The window draws the end of the list.
    t.drawnIds.value = [47, 48, 49]
    await nextTick()
    expect(document.activeElement).toBe(t.handleOf(2))
    expect(t.reveal).not.toHaveBeenCalled()
  })

  it('without `virtual` a row that is not drawn is left alone', async () => {
    const t = setup({ drawn: [0, 1, 2] })
    t.handleOf(2).focus()
    t.key(t.handleOf(2), 'End')
    await t.writeBack(t.moves[0])
    expect(t.scrollToIndex).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })
})

describe('useRowReorder: needs rowKey (C-133)', () => {
  it('is off without rowKey and warns once in a development build', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = setup({ rowKey: false })
    expect(t.api().enabled()).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('`rowReorderable` needs `rowKey`')
    t.reorderable.value = false
  })

  it('a production build does not warn', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setup({ rowKey: false })
    expect(warn).not.toHaveBeenCalled()
  })
})
