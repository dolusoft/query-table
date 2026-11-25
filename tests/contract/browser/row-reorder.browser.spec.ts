import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi
} from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import { defineComponent, h, ref, shallowRef, type Slot } from 'vue'

import QueryTable, {
  type QueryChangeReason,
  type RowFocusPayload,
  type RowReorderPayload,
  type TableQuery
} from '@dolusoft/query-table'

import { createCollector } from '../../support/dom-collector'
import { columns, makeQuery } from '../../support/fixtures'
import { frames, useFixedLayout } from '../../support/scroll-host'

// C-133 in a real browser, with the playground skin: a row's handle drags
// the row among the rows that are not pinned (attributes only, one event on
// release), moves it by key, gives the focus back after the write-back, also
// in a virtual body, and keeps its keys from the row navigation (C-109). Not
// compared with a 3.21 baseline (`ADDED_AFTER_BASELINE`).

interface Row {
  id: number
  name: string
  age: number
  joined: string
}

const makeRows = (count = 5): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Name ${i + 1}`,
    age: 20 + i,
    joined: '2024-01-10'
  }))

/** What a consumer does with `rowReorder`: the row goes next to `target`. */
const applyMove = (list: Row[], move: RowReorderPayload<Row>) => {
  const moved = list.find(row => row.id === move.rowKey)!
  const rest = list.filter(row => row !== moved)
  const at = rest.findIndex(row => row.id === move.target)
  rest.splice(move.place === 'before' ? at : at + 1, 0, moved)
  return rest
}

interface HostOptions {
  /** Write the move back to `rows`; default `true`. */
  writeBack?: boolean
  slots?: Record<string, Slot>
  /** A scroll box of this height around the table. */
  height?: number
}

const renderRows = async (
  props: Record<string, unknown> = {},
  options: HostOptions = {}
) => {
  const moves: Array<RowReorderPayload<Row>> = []
  const updates: QueryChangeReason[] = []
  const focused: Array<RowFocusPayload<Row>> = []
  const current = shallowRef<Row[]>((props.rows as Row[]) ?? makeRows())
  const query = ref<TableQuery>(makeQuery())
  const box = ref<HTMLElement | null>(null)
  const Host = defineComponent({
    setup() {
      const onMove = (move: RowReorderPayload<Row>) => {
        moves.push(move)
        if (options.writeBack !== false) {
          current.value = applyMove(current.value, move)
        }
      }
      return () => {
        const table = h(
          QueryTable as never,
          {
            columns: columns(),
            totalRows: 50,
            rowKey: 'id',
            rowReorderable: true,
            ...props,
            rows: current.value,
            query: query.value,
            'onUpdate:query': (next: TableQuery, reason: QueryChangeReason) => {
              updates.push(reason)
              query.value = next
            },
            onRowReorder: onMove,
            onRowFocus: (payload: RowFocusPayload<Row>) => focused.push(payload)
          },
          options.slots ?? {}
        )
        return options.height
          ? h(
              'div',
              {
                ref: box,
                style: { height: `${options.height}px`, overflow: 'auto' }
              },
              [table]
            )
          : table
      }
    }
  })
  const screen = await render(Host)
  await frames(2)
  return {
    screen,
    moves,
    updates,
    focused,
    box: () => box.value!,
    order: () => current.value.map(row => row.id),
    setRows: (next: Row[]) => {
      current.value = next
    }
  }
}

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** The drawn data rows of the table, never a nested table's. */
const dataRows = () => [
  ...document.querySelectorAll<HTMLElement>(
    '.qt-datatable table.qt-table > tbody > tr[data-row-index]'
  )
]
const rowOf = (id: number) =>
  dataRows().find(
    tr => tr.querySelector('td[data-field="id"]')?.textContent === String(id)
  )!
const handleOf = (id: number) =>
  rowOf(id).querySelector<HTMLElement>(':scope > td > .qt-row-reorder-handle')!
const drawnOrder = () =>
  dataRows().map(tr =>
    Number(tr.querySelector('td[data-field="id"]')!.textContent)
  )
const idOf = (tr: Element) =>
  Number(tr.querySelector('td[data-field="id"]')!.textContent)

const marks = () => ({
  dragging: [...document.querySelectorAll('tbody > tr[data-dragging]')].map(
    idOf
  ),
  drop: [
    ...document.querySelectorAll<HTMLElement>('tbody > tr[data-drop]')
  ].map(tr => `${idOf(tr)}:${tr.dataset.drop}`)
})

const pointer = (x: number, y: number) => ({
  bubbles: true,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: 'mouse',
  isPrimary: true,
  button: 0,
  buttons: 1
})

/** Presses a handle without releasing it. */
const press = async (handle: Element) => {
  const box = handle.getBoundingClientRect()
  handle.dispatchEvent(
    new PointerEvent(
      'pointerdown',
      pointer(box.left + box.width / 2, box.top + box.height / 2)
    )
  )
  await frames()
}

/** Moves the pressed pointer to a height; the handle has the capture. */
const moveTo = async (handle: Element, y: number) => {
  handle.dispatchEvent(new PointerEvent('pointermove', pointer(0, y)))
  await frames()
}

/** Moves the pressed pointer over a half of an element. */
const moveOver = async (
  handle: Element,
  over: Element,
  half: 'before' | 'after'
) => {
  const box = over.getBoundingClientRect()
  await moveTo(handle, box.top + box.height * (half === 'before' ? 0.25 : 0.75))
}

const release = async (handle: Element, type = 'pointerup') => {
  handle.dispatchEvent(new PointerEvent(type, pointer(0, 0)))
  await frames()
}

/** Presses a key on an element; `true` when its default was prevented. */
const key = async (element: Element, name: string) => {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true
  })
  element.dispatchEvent(event)
  await frames()
  return event.defaultPrevented
}

const moved = (moves: Array<RowReorderPayload<Row>>) =>
  moves.map(move => `${move.rowKey}>${move.place}:${move.target}`)

describe('C-133 Row reorder handle [own]', () => {
  test('a real pointer drag places the row where it is released', async () => {
    const { moves, updates, order } = await renderRows()
    const target = rowOf(3)
    await userEvent.dragAndDrop(
      page.elementLocator(handleOf(1)),
      page.elementLocator(target),
      { targetPosition: { x: 12, y: target.offsetHeight - 4 } }
    )
    await frames()
    expect(moved(moves)).toEqual(['1>after:3'])
    expect(moves[0].row.id).toBe(1)
    expect(moves[0].rowIndex).toBe(0)
    expect(order()).toEqual([2, 3, 1, 4, 5])
    expect(drawnOrder()).toEqual([2, 3, 1, 4, 5])
    expect(marks()).toEqual({ dragging: [], drop: [] })
    expect(updates).toEqual([])
  })

  test('dragging previews with attributes only and emits one event on release', async () => {
    const { moves, order } = await renderRows()
    const handle = handleOf(1)
    await press(handle)
    expect(document.activeElement).toBe(handle)
    expect(marks()).toEqual({ dragging: [1], drop: [] })
    await moveOver(handle, rowOf(3), 'after')
    expect(marks()).toEqual({ dragging: [1], drop: ['3:after'] })
    await moveOver(handle, rowOf(2), 'before')
    expect(marks()).toEqual({ dragging: [1], drop: ['2:before'] })
    await moveOver(handle, rowOf(5), 'after')
    expect(marks()).toEqual({ dragging: [1], drop: ['5:after'] })
    // Nothing is emitted and nothing moves while dragging.
    expect(moves).toEqual([])
    expect(drawnOrder()).toEqual([1, 2, 3, 4, 5])

    await release(handle)
    expect(moved(moves)).toEqual(['1>after:5'])
    expect(order()).toEqual([2, 3, 4, 5, 1])
    expect(drawnOrder()).toEqual([2, 3, 4, 5, 1])
    expect(marks()).toEqual({ dragging: [], drop: [] })
  })

  test('a release where the order stays, or over no row, emits nothing', async () => {
    const { moves } = await renderRows()
    const handle = handleOf(2)
    await press(handle)
    await moveOver(handle, rowOf(1), 'after')
    expect(marks().drop).toEqual(['1:after'])
    await release(handle)
    await press(handle)
    await moveOver(handle, rowOf(3), 'before')
    await release(handle)
    await press(handle)
    await moveOver(handle, rowOf(2), 'after')
    expect(marks().drop).toEqual([])
    await release(handle)
    // Below the table: no row under the pointer.
    await press(handle)
    await moveTo(handle, rowOf(5).getBoundingClientRect().bottom + 200)
    expect(marks()).toEqual({ dragging: [2], drop: [] })
    await release(handle)
    expect(moves).toEqual([])
    expect(drawnOrder()).toEqual([1, 2, 3, 4, 5])
  })

  test('Escape, a pointercancel or a lost capture end the drag without an event', async () => {
    const { moves } = await renderRows()
    const handle = handleOf(1)
    await press(handle)
    await moveOver(handle, rowOf(3), 'after')
    expect(await key(handle, 'Escape')).toBe(true)
    expect(marks()).toEqual({ dragging: [], drop: [] })
    await release(handle)

    await press(handle)
    await moveOver(handle, rowOf(3), 'after')
    await release(handle, 'pointercancel')
    expect(marks()).toEqual({ dragging: [], drop: [] })

    await press(handle)
    await moveOver(handle, rowOf(3), 'after')
    handle.dispatchEvent(new PointerEvent('lostpointercapture', pointer(0, 0)))
    await frames()
    expect(marks()).toEqual({ dragging: [], drop: [] })
    await release(handle)
    expect(moves).toEqual([])
  })

  test('keys move one position, Home and End to the ends; the edge does nothing; the focus comes back', async () => {
    const { moves, order, updates } = await renderRows()
    handleOf(1).focus()
    // At the edge nothing moves, but the key is still the handle's.
    expect(await key(handleOf(1), 'ArrowUp')).toBe(true)
    expect(moves).toEqual([])
    expect(await key(handleOf(1), 'ArrowDown')).toBe(true)
    expect(order()).toEqual([2, 1, 3, 4, 5])
    expect(document.activeElement).toBe(handleOf(1))
    await key(handleOf(1), 'End')
    expect(order()).toEqual([2, 3, 4, 5, 1])
    expect(document.activeElement).toBe(handleOf(1))
    expect(await key(handleOf(1), 'ArrowDown')).toBe(true)
    await key(handleOf(1), 'Home')
    expect(order()).toEqual([1, 2, 3, 4, 5])
    expect(document.activeElement).toBe(handleOf(1))
    await key(handleOf(1), 'Home')
    expect(moved(moves)).toEqual(['1>after:2', '1>after:5', '1>before:2'])
    // A key with a modifier is the browser's.
    expect(await key(handleOf(3), 'x')).toBe(false)
    const alt = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      altKey: true,
      bubbles: true,
      cancelable: true
    })
    handleOf(3).dispatchEvent(alt)
    expect(alt.defaultPrevented).toBe(false)
    expect(moves).toHaveLength(3)
    expect(updates).toEqual([])
  })

  test('without a write-back the row stays and keeps the focus; a click elsewhere ends the refocus', async () => {
    const { moves, setRows } = await renderRows({}, { writeBack: false })
    const handle = handleOf(2)
    handle.focus()
    await key(handle, 'ArrowDown')
    expect(moved(moves)).toEqual(['2>after:3'])
    expect(drawnOrder()).toEqual([1, 2, 3, 4, 5])
    expect(document.activeElement).toBe(handle)

    await userEvent.click(
      page.elementLocator(rowOf(4).querySelector('td[data-field="name"]')!)
    )
    expect(document.activeElement).not.toBe(handle)
    // A later order from outside moves no focus.
    setRows(applyMove(makeRows(), moves[0]))
    await frames()
    expect(drawnOrder()).toEqual([1, 3, 2, 4, 5])
    expect(document.activeElement).not.toBe(handleOf(2))
  })

  test('pinned rows draw no handle and are no target; the keys skip them', async () => {
    const { moves } = await renderRows(
      { rowPinning: { top: ['5'], bottom: [] } },
      { writeBack: false }
    )
    expect(drawnOrder()).toEqual([5, 1, 2, 3, 4])
    const pinned = rowOf(5)
    expect(pinned.dataset.pinnedRow).toBe('top')
    expect(pinned.querySelector('.qt-row-reorder-handle')).toBeNull()
    expect(pinned.children[0].children).toHaveLength(0)

    const handle = handleOf(3)
    await press(handle)
    await moveOver(handle, pinned, 'before')
    expect(marks().drop).toEqual([])
    await release(handle)
    expect(moves).toEqual([])

    handle.focus()
    await key(handle, 'Home')
    await key(handle, 'End')
    expect(moved(moves)).toEqual(['3>before:1', '3>after:4'])
  })

  test("over a row's subtable row the row goes after that row", async () => {
    const rows = makeRows().map(row =>
      row.id === 2 ? { ...row, isExpanded: true } : row
    )
    const { moves } = await renderRows(
      { rows, hasSubtable: true },
      {
        slots: {
          subtable: () => [h('div', { style: { height: '60px' } }, 'details')]
        }
      }
    )
    const subtable = document.querySelector('tbody > tr.qt-subtable-row')!
    const handle = handleOf(4)
    await press(handle)
    await moveOver(handle, subtable, 'before')
    expect(marks().drop).toEqual(['2:after'])
    await release(handle)
    expect(moved(moves)).toEqual(['4>after:2'])
  })

  test('the handle column comes first and hosts the clear-all button', async () => {
    await renderRows({
      filterable: true,
      hasRightPanel: true,
      selection: {}
    })
    const header = document.querySelector('thead > tr')!
    const first = header.children[0] as HTMLElement
    expect(first.tagName).toBe('TH')
    expect(first.querySelector('.qt-clear-all-button')).not.toBeNull()
    const cells = [...rowOf(1).children].slice(0, 3)
    expect(cells[0].querySelector('.qt-row-reorder-handle')).not.toBeNull()
    expect(cells[1].querySelector('.qt-right-panel-button')).not.toBeNull()
    expect(cells[2].querySelector('.qt-select-row')).not.toBeNull()
    const handle = handleOf(1)
    expect(handle.getAttribute('type')).toBe('button')
    expect(handle.getAttribute('aria-label')).toBe('Move row')
    expect(handle.getAttribute('aria-keyshortcuts')).toBe(
      'ArrowUp ArrowDown Home End'
    )
  })

  test('with rowNavigation the handle is not the focus target and keeps its keys (C-109)', async () => {
    const { moves, focused, order } = await renderRows({
      rowNavigation: true,
      hasRightPanel: true
    })
    const panel = (id: number) =>
      rowOf(id).querySelector<HTMLElement>('.qt-right-panel-button')!
    panel(1).focus()
    await key(panel(1), 'ArrowDown')
    await frames()
    expect(document.activeElement).toBe(panel(2))
    expect(focused.map(payload => payload.row.id)).toEqual([2])

    handleOf(2).focus()
    await key(handleOf(2), 'ArrowDown')
    await frames()
    expect(order()).toEqual([1, 3, 2, 4, 5])
    expect(document.activeElement).toBe(handleOf(2))
    expect(focused).toHaveLength(1)
    expect(moved(moves)).toEqual(['2>after:3'])
  })

  test('without rowKey there is no handle, and a development build warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await renderRows({ rowKey: undefined })
    expect(document.querySelector('.qt-row-reorder-handle')).toBeNull()
    expect(rowOf(1).children[0].getAttribute('data-field')).toBe('id')
    expect(warn.mock.calls.map(call => call[0])).toEqual([
      '[QueryTable] `rowReorderable` needs `rowKey`; it is ignored without one (C-133).'
    ])
  })

  test('the DOM while a row is dragged matches the DOM contract', async () => {
    const dom = createCollector()
    await renderRows()
    const handle = handleOf(1)
    await press(handle)
    await moveOver(handle, rowOf(3), 'after')
    dom.collect()
    await release(handle, 'pointercancel')
    dom.expectNothingOutsideContract()
    dom.expectEntriesRendered(entry => entry.addedBy === 'C-133')
  })
})

describe('C-133 Row reorder handle in a virtual body [own]', () => {
  const many = () => makeRows(200)

  test('End moves the row out of the window; the focus lands on its handle once drawn', async () => {
    const { moves, box } = await renderRows(
      { rows: many(), virtual: { rowHeight: 32 } },
      { height: 300 }
    )
    const handle = handleOf(2)
    handle.focus()
    await key(handle, 'End')
    await frames(6)
    expect(moved(moves)).toEqual(['2>after:200'])
    expect(box().scrollTop).toBeGreaterThan(0)
    expect(document.activeElement).toBe(handleOf(2))
    expect(drawnOrder().at(-1)).toBe(2)
  })

  test('a dragged row that leaves the window does not end the drag', async () => {
    const { moves, box } = await renderRows(
      { rows: many(), virtual: { rowHeight: 32 } },
      { height: 300 }
    )
    const handle = handleOf(1)
    await press(handle)
    box().scrollTop = 32 * 100
    box().dispatchEvent(new Event('scroll'))
    await frames(4)
    const target = rowOf(103)
    target.dispatchEvent(
      new PointerEvent(
        'pointermove',
        pointer(0, target.getBoundingClientRect().top + 4)
      )
    )
    await frames()
    expect(marks().drop).toEqual(['103:before'])
    target.dispatchEvent(new PointerEvent('pointerup', pointer(0, 0)))
    await frames()
    expect(moved(moves)).toEqual(['1>before:103'])
    expect(marks()).toEqual({ dragging: [], drop: [] })
  })
})
