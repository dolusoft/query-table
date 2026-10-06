import { afterEach, describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup } from 'vitest-browser-vue'
import { h } from 'vue'

import type {
  Column,
  ColumnResizePayload,
  FilterMenuSlotProps
} from '@dolusoft/query-table'

import { renderColumnsTable } from '../../support/columns-host'
import { el, renderTable, rows } from '../../support/helpers'

// Geometry of right-pinned columns in a real browser, with the playground
// skin (it makes `[data-pinned]` sticky at `--qt-pin-left` and
// `--qt-pin-right`).

afterEach(() => {
  cleanup()
})

const frames = async (count = 2) => {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve))
  }
}

/** Consumer CSS of these tests: the table takes its columns' widths. */
const growTable = () => {
  el('.qt-table').style.width = 'max-content'
}

const scroller = () => el('.qt-table-responsive')
const rect = (cell: Element) => cell.getBoundingClientRect()

/** The inner right edge of the scroll container (no border, no scrollbar). */
const scrollerRight = () =>
  rect(scroller()).left + scroller().clientLeft + scroller().clientWidth

/** Within a pixel: edges are rounded, the container's edge is not. */
const near = (a: number, b: number) => Math.abs(a - b) <= 1

const offsetOf = (cell: Element) =>
  parseFloat((cell as HTMLElement).style.getPropertyValue('--qt-pin-right'))

/** An edge of every cell matching `selector`, rounded, by row. */
const edgesOf = (selector: string, edge: 'left' | 'right') =>
  [...el('.qt-table').querySelectorAll('tr')]
    .map(tr =>
      [...tr.querySelectorAll(`:scope > ${selector}`)].map(cell =>
        Math.round(rect(cell)[edge])
      )
    )
    .filter(row => row.length > 0)

const both = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number', width: '80px', pinned: 'left' },
  { field: 'name', title: 'Name', width: '400px' },
  { field: 'extra', title: 'Extra', width: '900px' },
  {
    field: 'age',
    title: 'Age',
    type: 'number',
    width: '12rem',
    pinned: 'right'
  },
  { field: 'joined', title: 'Joined', type: 'date', pinned: 'right' }
]

const renderBoth = async (props: Record<string, unknown> = {}) => {
  const table = await renderTable({
    columns: both(),
    rows: rows(5),
    footerRows: [{ cells: [{ field: 'age', text: 'Total' }] }],
    ...props
  })
  growTable()
  await frames(3)
  return table
}

describe('C-71 Right pinning [tanstack] [own]', () => {
  test('writes the cumulative measured widths from the right', async () => {
    await renderTable({
      columns: [
        { field: 'id', title: 'ID', type: 'number', width: '80px' },
        { field: 'name', title: 'Name', width: '400px' },
        {
          field: 'age',
          title: 'Age',
          type: 'number',
          width: '12rem',
          pinned: 'right'
        },
        {
          field: 'joined',
          title: 'Joined',
          type: 'date',
          width: '20%',
          pinned: 'right'
        }
      ],
      rows: rows(3)
    })
    growTable()
    await frames(3)
    const header = [...el('thead tr').querySelectorAll('[data-pinned="right"]')]
    expect(header.map(cell => cell.getAttribute('data-field'))).toEqual([
      'age',
      'joined'
    ])
    const joinedWidth = rect(header[1]).width
    expect(joinedWidth).toBeGreaterThan(0)
    expect(offsetOf(header[1])).toBe(0)
    expect(offsetOf(header[0])).toBeCloseTo(joinedWidth, 0)
    // Every row's right-pinned cells carry the offsets of their header cells.
    for (const row of el('tbody').querySelectorAll('tr')) {
      const cells = [...row.querySelectorAll('[data-pinned="right"]')]
      expect(cells.map(offsetOf)).toEqual(header.map(offsetOf))
    }
  })

  test('right-pinned header, body and footer cells stay at the right edge while scrolling', async () => {
    await renderBoth()
    const before = edgesOf('[data-pinned="right"]', 'right')
    // the header, five body rows and the footer
    expect(before).toHaveLength(7)
    for (const row of before) {
      expect(row).toEqual(before[0])
      expect(near(row.at(-1)!, scrollerRight())).toBe(true)
    }
    scroller().scrollLeft = 200
    await frames()
    expect(scroller().scrollLeft).toBeGreaterThan(150)
    const after = edgesOf('[data-pinned="right"]', 'right')
    expect(after).toEqual(before)
    // The pinned cells paint over the scrolled ones (the skin's background).
    const age = rect(el('tbody tr[data-row-index="0"] td[data-field="age"]'))
    const top = document.elementFromPoint(
      age.left + age.width / 2,
      age.top + age.height / 2
    )
    expect(top?.closest('td')?.getAttribute('data-field')).toBe('age')
  })

  test('left and right pinned together stay in line', async () => {
    await renderBoth()
    const lefts = edgesOf('[data-pinned=""]', 'left')
    const rights = edgesOf('[data-pinned="right"]', 'right')
    const name = () => rect(el('thead th[data-field="name"]')).left
    const nameBefore = name()
    scroller().scrollLeft = 300
    await frames()
    expect(scroller().scrollLeft).toBeGreaterThan(200)
    expect(name()).toBeLessThan(nameBefore - 200)
    expect(edgesOf('[data-pinned=""]', 'left')).toEqual(lefts)
    expect(edgesOf('[data-pinned="right"]', 'right')).toEqual(rights)
  })

  test('a hidden right-pinned column takes no offset', async () => {
    await renderBoth({
      columns: [
        ...both().slice(0, 3),
        { field: 'age', title: 'Age', pinned: 'right', hide: true },
        { field: 'joined', title: 'Joined', pinned: 'right' }
      ]
    })
    expect(document.querySelector('[data-field="age"]')).toBeNull()
    const header = [...el('thead tr').querySelectorAll('[data-pinned="right"]')]
    expect(header.map(cell => cell.getAttribute('data-field'))).toEqual([
      'joined'
    ])
    expect(offsetOf(header[0])).toBe(0)
    for (const row of edgesOf('[data-pinned="right"]', 'right')) {
      expect(near(row[0], scrollerRight())).toBe(true)
    }
  })

  test('utilities are pinned only with a left-pinned column', async () => {
    const rightOnly = both().map(column =>
      column.pinned === 'left' ? { ...column, pinned: undefined } : column
    )
    const { rerender } = await renderBoth({
      columns: rightOnly,
      hasSubtable: true
    })
    const utilityCells = () =>
      [
        ...el('.qt-table').querySelectorAll(
          'tr > :not([data-field]):not([colspan])'
        )
      ].filter(cell => !cell.closest('.qt-subtable-row'))
    expect(utilityCells().length).toBeGreaterThan(0)
    expect(
      utilityCells().map(cell => cell.getAttribute('data-pinned'))
    ).toEqual(utilityCells().map(() => null))
    await rerender({ columns: both(), hasSubtable: true })
    await frames(3)
    expect(
      utilityCells().map(cell => cell.getAttribute('data-pinned'))
    ).toEqual(utilityCells().map(() => ''))
  })

  test("control.pin('right') through the filter menu moves the column to the right edge", async () => {
    const { changes, updates, columns } = await renderColumnsTable(
      {},
      {
        slots: {
          'filter-menu': (menu: FilterMenuSlotProps) => [
            h(
              'button',
              {
                type: 'button',
                class: 'pin-right',
                onClick: () => menu.control.pin('right')
              },
              'Pin right'
            )
          ]
        }
      }
    )
    el('th[data-field="id"] .pin-right').click()
    await frames()
    expect(changes).toHaveLength(1)
    expect(changes[0][1]).toBe('pin')
    expect(columns().find(column => column.field === 'id')?.pinned).toBe(
      'right'
    )
    const header = [...el('thead tr').querySelectorAll('th[data-field]')]
    expect(header.at(-1)?.getAttribute('data-field')).toBe('id')
    expect(header.at(-1)?.getAttribute('data-pinned')).toBe('right')
    expect(updates).toEqual([])
  })
})

/** Presses a handle with the mouse pointer and moves it by `dx`, in steps. */
const press = async (handle: Element, dx: number) => {
  const box = rect(handle)
  const x = box.left + box.width / 2
  const fire = (type: string, clientX: number) =>
    handle.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX,
        clientY: box.top + box.height / 2,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1
      })
    )
  fire('pointerdown', x)
  for (let step = 1; step <= 4; step++) {
    fire('pointermove', x + (dx * step) / 4)
  }
  await frames()
  return {
    x,
    release: async () => {
      fire('pointerup', x + dx)
      await frames()
    }
  }
}

/** The element a pointer at `x` hits, on the header row. */
const hitAt = (x: number) =>
  document.elementFromPoint(x, rect(el('thead th[data-field]')).top + 12)

const headerOf = (field: string) => el(`thead th[data-field="${field}"]`)
const handleOf = (field: string) =>
  el(`thead th[data-field="${field}"] > .qt-resize-handle`)

const renderResizable = async () => {
  const resized: ColumnResizePayload[] = []
  const table = await renderBoth({
    resizable: true,
    onColumnResize: (payload: ColumnResizePayload) => resized.push(payload)
  })
  return { ...table, resized }
}

describe('C-71 Resizing a right-pinned column [own]', () => {
  test('the handle sits on the free left edge; dragging it left widens the column', async () => {
    const { resized, updates } = await renderResizable()
    const joined = headerOf('joined')
    const start = rect(joined).width
    expect(near(rect(joined).right, scrollerRight())).toBe(true)
    // The handle is on the left edge, where the column can grow; not on the
    // right one, which stays at the container's edge.
    expect(hitAt(rect(joined).left + 4)).toBe(handleOf('joined'))
    expect(hitAt(rect(joined).right - 4)).not.toBe(handleOf('joined'))
    const { x, release } = await press(handleOf('joined'), -60)
    expect(rect(joined).width).toBeCloseTo(start + 60, 0)
    // The free edge, and the handle on it, follow the pointer.
    const handle = rect(handleOf('joined'))
    expect(handle.left + handle.width / 2).toBeCloseTo(x - 60, 0)
    expect(near(rect(joined).right, scrollerRight())).toBe(true)
    await release()
    expect(resized).toEqual([
      { field: 'joined', width: Math.round(start + 60) }
    ])
    expect(updates).toEqual([])
  })

  test('next to the scrolled part, the neighbor keeps its handle inside its own cell', async () => {
    await renderResizable()
    scroller().scrollLeft = scroller().scrollWidth
    await frames()
    const age = headerOf('age')
    const extra = headerOf('extra')
    expect(near(rect(extra).right, rect(age).left)).toBe(true)
    expect(hitAt(rect(age).left + 4)).toBe(handleOf('age'))
    expect(hitAt(rect(age).left - 16)).toBe(handleOf('extra'))
  })

  test('a written-back width moves the offsets of the right-pinned cells before it', async () => {
    const { resized, rerender } = await renderResizable()
    const { release } = await press(handleOf('joined'), -60)
    await release()
    expect(resized).toHaveLength(1)
    await rerender({
      resizable: true,
      columns: both().map(column =>
        column.field === 'joined'
          ? { ...column, width: `${resized[0].width}px` }
          : column
      )
    })
    growTable()
    await frames(3)
    const joined = headerOf('joined')
    expect(rect(joined).width).toBeCloseTo(resized[0].width, 0)
    expect(offsetOf(headerOf('age'))).toBeCloseTo(rect(joined).width, 0)
    expect(near(rect(headerOf('age')).right, rect(joined).left)).toBe(true)
    const rights = edgesOf('[data-pinned="right"]', 'right')
    for (const row of rights) {
      expect(row).toEqual(rights[0])
      expect(near(row.at(-1)!, scrollerRight())).toBe(true)
    }
  })

  test('ArrowLeft widens and ArrowRight narrows a right-pinned column', async () => {
    const { resized } = await renderResizable()
    const start = Math.round(rect(headerOf('joined')).width)
    handleOf('joined').focus()
    await userEvent.keyboard('{ArrowLeft}')
    await userEvent.keyboard('{ArrowRight}')
    expect(resized).toEqual([
      { field: 'joined', width: start + 10 },
      { field: 'joined', width: start - 10 }
    ])
  })
})
