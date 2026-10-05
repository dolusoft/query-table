import axe from 'axe-core'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup } from 'vitest-browser-vue'

import type { Theme } from '../../playground/harness/theme'
import type { Column, ColumnResizePayload } from '../../src/contract'
import { el, renderTable, rows } from '../support/helpers'

// Geometry of pinned and resized columns in a real browser, with the
// playground skin (it makes `[data-pinned]` sticky at `--qt-pin-left`).

afterEach(() => {
  cleanup()
})

const frames = async (count = 2) => {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve))
  }
}

const wide = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number', width: '80px', pinned: 'left' },
  { field: 'name', title: 'Name', width: '160px', pinned: 'left' },
  { field: 'age', title: 'Age', type: 'number', width: '400px' },
  { field: 'joined', title: 'Joined', type: 'date', width: '900px' }
]

/** Consumer CSS of these tests: the table takes its columns' widths. */
const growTable = (fixed = false) => {
  const table = el('.qt-table')
  table.style.width = 'max-content'
  if (fixed) {
    table.style.tableLayout = 'fixed'
  }
}

const left = (cell: Element) => cell.getBoundingClientRect().left
const scroller = () => el('.qt-table-responsive')

/** Left edge of every pinned cell, relative to the scroll container, by row. */
const pinnedLefts = () => {
  const origin = left(scroller()) + scroller().clientLeft
  return [...el('.qt-table').querySelectorAll('tr')]
    .map(tr =>
      [...tr.querySelectorAll(':scope > [data-pinned]')].map(cell =>
        Math.round(left(cell) - origin)
      )
    )
    .filter(row => row.length > 0)
}

const offsetOf = (cell: Element) =>
  parseFloat((cell as HTMLElement).style.getPropertyValue('--qt-pin-left'))

const renderPinned = async (props: Record<string, unknown> = {}) => {
  const resized: ColumnResizePayload[] = []
  const table = await renderTable({
    columns: wide(),
    rows: rows(5),
    hasSubtable: true,
    footerRows: [{ cells: [{ field: 'name', text: 'Total' }] }],
    onColumnResize: (payload: ColumnResizePayload) => resized.push(payload),
    ...props
  })
  growTable()
  await frames(3)
  return { ...table, resized }
}

describe('C-47 Pin offsets', () => {
  test('writes the cumulative measured widths and keeps header, body and footer in line', async () => {
    await renderPinned()
    const header = [...el('thead tr').querySelectorAll('[data-pinned]')]
    const widths = header.map(cell => cell.getBoundingClientRect().width)
    expect(header.map(offsetOf)).toEqual([0, widths[0], widths[0] + widths[1]])
    const rowsOfLefts = pinnedLefts()
    // header, five body rows, the footer row: three pinned cells each
    expect(rowsOfLefts).toHaveLength(7)
    for (const row of rowsOfLefts) {
      expect(row).toEqual(rowsOfLefts[0])
    }
  })

  test('pinned cells stay at their offset while the table scrolls sideways', async () => {
    await renderPinned()
    const before = pinnedLefts()
    const unpinned = el('thead th[data-field="age"]')
    const ageBefore = left(unpinned)
    scroller().scrollLeft = 300
    await frames()
    expect(scroller().scrollLeft).toBeGreaterThan(200)
    expect(pinnedLefts()).toEqual(before)
    expect(left(unpinned)).toBeLessThan(ageBefore - 200)
    // The pinned cells paint over the scrolled ones (the skin's background).
    const id = el(
      'tbody tr[data-row-index="0"] td[data-field="name"]'
    ).getBoundingClientRect()
    const top = document.elementFromPoint(
      id.left + id.width / 2,
      id.top + id.height / 2
    )
    expect(top?.closest('td')?.getAttribute('data-field')).toBe('name')
  })

  test('measures again after a pinned column is resized', async () => {
    const { rerender } = await renderPinned()
    const name = () => el('thead th[data-field="name"]')
    const joined = () => el('thead th[data-field="joined"]')
    await rerender({
      columns: wide().map(column =>
        column.field === 'id' ? { ...column, width: '200px' } : column
      )
    })
    await frames(3)
    const idWidth = el('thead th[data-field="id"]').getBoundingClientRect()
      .width
    expect(idWidth).toBeGreaterThan(150)
    expect(offsetOf(name())).toBeCloseTo(
      offsetOf(el('thead th[data-field="id"]')) + idWidth,
      1
    )
    // A column pinned later moves next to the others.
    await rerender({
      columns: wide().map(column =>
        column.field === 'joined'
          ? { ...column, pinned: 'left' as const }
          : column
      )
    })
    await frames(3)
    expect(joined().hasAttribute('data-pinned')).toBe(true)
    expect(joined().nextElementSibling?.getAttribute('data-field')).toBe('age')
    const rowsOfLefts = pinnedLefts()
    for (const row of rowsOfLefts) {
      expect(row).toEqual(rowsOfLefts[0])
    }
  })
})

/** A drag with the mouse pointer (id 1), one move per animation frame. */
const drag = async (handle: Element, dx: number, finish: 'up' | 'escape') => {
  const box = handle.getBoundingClientRect()
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  const fire = (type: string, clientX: number) =>
    handle.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX,
        clientY: y,
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
  const preview = handle.closest('th')!.getBoundingClientRect().width
  if (finish === 'up') {
    fire('pointerup', x + dx)
  } else {
    // The pressed handle has the focus, so the key goes to it.
    expect(document.activeElement).toBe(handle)
    await userEvent.keyboard('{Escape}')
  }
  await frames()
  return preview
}

describe('C-49 Dragging a handle', () => {
  test('previews while dragging and emits one event on release', async () => {
    const { resized, updates } = await renderPinned({ resizable: true })
    const th = el('thead th[data-field="age"]')
    const start = th.getBoundingClientRect().width
    const preview = await drag(th.querySelector('.qt-resize-handle')!, 60, 'up')
    expect(preview).toBeCloseTo(start + 60, 0)
    expect(resized).toEqual([{ field: 'age', width: Math.round(start + 60) }])
    // The table keeps no width: nobody wrote it back, so the column returns.
    expect(th.getBoundingClientRect().width).toBeCloseTo(start, 0)
    expect(updates).toEqual([])
  })

  test('Escape cancels: no event, no preview left', async () => {
    const { resized } = await renderPinned({ resizable: true })
    const th = el('thead th[data-field="age"]')
    const start = th.getBoundingClientRect().width
    const preview = await drag(
      th.querySelector('.qt-resize-handle')!,
      80,
      'escape'
    )
    expect(preview).toBeGreaterThan(start + 40)
    expect(resized).toEqual([])
    expect(th.style.width).toBe('400px')
    expect(th.getBoundingClientRect().width).toBeCloseTo(start, 0)
  })

  test('a written-back width moves the pinned offsets after it', async () => {
    const { resized, rerender } = await renderPinned({ resizable: true })
    const nameTh = el('thead th[data-field="name"]')
    await drag(el('thead th[data-field="id"] .qt-resize-handle'), 40, 'up')
    expect(resized).toHaveLength(1)
    await rerender({
      resizable: true,
      columns: wide().map(column =>
        column.field === resized[0].field
          ? { ...column, width: `${resized[0].width}px` }
          : column
      )
    })
    growTable()
    await frames(3)
    const id = el('thead th[data-field="id"]')
    expect(id.getBoundingClientRect().width).toBeCloseTo(resized[0].width, 0)
    expect(offsetOf(nameTh)).toBeCloseTo(
      offsetOf(id) + id.getBoundingClientRect().width,
      1
    )
    const rowsOfLefts = pinnedLefts()
    for (const row of rowsOfLefts) {
      expect(row).toEqual(rowsOfLefts[0])
    }
  })
})

/** Presses a handle and moves it, without releasing. */
const press = async (handle: Element, dx: number) => {
  const box = handle.getBoundingClientRect()
  const init = {
    bubbles: true,
    clientY: box.top + box.height / 2,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1
  }
  const x = box.left + box.width / 2
  handle.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: x }))
  handle.dispatchEvent(
    new PointerEvent('pointermove', { ...init, clientX: x + dx })
  )
  await frames()
}

describe('C-49 Dragging a handle: ends without a release', () => {
  test.each(['pointercancel', 'lostpointercapture'])(
    '%s ends the drag with no event and no preview',
    async type => {
      const { resized } = await renderPinned({ resizable: true })
      const th = el('thead th[data-field="age"]')
      const start = th.getBoundingClientRect().width
      const handle = th.querySelector('.qt-resize-handle')!
      await press(handle, 70)
      expect(th.getBoundingClientRect().width).toBeGreaterThan(start + 40)
      handle.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId: 1 })
      )
      await frames()
      expect(resized).toEqual([])
      expect(th.getBoundingClientRect().width).toBeCloseTo(start, 0)
      // A later release of the same pointer does nothing either.
      handle.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 1,
          clientX: 900
        })
      )
      expect(resized).toEqual([])
    }
  )

  test('unmounting during a drag cancels it and disconnects the observer', async () => {
    const disconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect')
    const { resized } = await renderPinned({ resizable: true })
    await press(el('thead th[data-field="age"] .qt-resize-handle'), 50)
    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => errors.push(event.error)
    window.addEventListener('error', onError)
    disconnect.mockClear()
    cleanup()
    await frames(3)
    window.removeEventListener('error', onError)
    expect(disconnect).toHaveBeenCalled()
    expect(resized).toEqual([])
    expect(errors).toEqual([])
    disconnect.mockRestore()
  })
})

describe('C-47 Pin offsets: hidden columns and the footer', () => {
  test('a written-back width re-measures without rebuilding the observer', async () => {
    const { rerender } = await renderPinned({ resizable: true })
    const observe = vi.spyOn(ResizeObserver.prototype, 'observe')
    await rerender({
      resizable: true,
      columns: wide().map(column =>
        column.field === 'id' ? { ...column, width: '150px' } : column
      )
    })
    await frames(3)
    expect(observe).not.toHaveBeenCalled()
    const id = el('thead th[data-field="id"]')
    expect(offsetOf(el('thead th[data-field="name"]'))).toBeCloseTo(
      offsetOf(id) + id.getBoundingClientRect().width,
      1
    )
    observe.mockRestore()
  })

  test('a hidden pinned column takes no offset and leaves no gap', async () => {
    await renderPinned({
      columns: [
        { field: 'id', title: 'ID', width: '80px', pinned: 'left', hide: true },
        ...wide().slice(1)
      ]
    })
    expect(document.querySelector('[data-field="id"]')).toBeNull()
    const header = [...el('thead tr').querySelectorAll('[data-pinned]')]
    // The utility cell, then Name right after it.
    expect(header.map(offsetOf)).toEqual([
      0,
      header[0].getBoundingClientRect().width
    ])
    const rowsOfLefts = pinnedLefts()
    for (const row of rowsOfLefts) {
      expect(row).toEqual(rowsOfLefts[0])
    }
  })

  test('the footer cell spanning the utilities stays in line while scrolling', async () => {
    await renderPinned()
    const footerCell = el('.qt-footer tr > [data-pinned]')
    const utilityHead = el('thead tr > [data-pinned]')
    const before = left(footerCell)
    expect(before).toBeCloseTo(left(utilityHead), 0)
    scroller().scrollLeft = 300
    await frames()
    expect(scroller().scrollLeft).toBeGreaterThan(200)
    expect(left(footerCell)).toBeCloseTo(before, 0)
    expect(left(footerCell)).toBeCloseTo(left(utilityHead), 0)
  })
})

describe('C-50 Keyboard and autofit', () => {
  test('arrow keys resize from the keyboard and never sort', async () => {
    const { resized, updates } = await renderPinned({ resizable: true })
    const th = el('thead th[data-field="age"]')
    const start = Math.round(th.getBoundingClientRect().width)
    const handle = th.querySelector<HTMLElement>('.qt-resize-handle')!
    handle.focus()
    expect(document.activeElement).toBe(handle)
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    await userEvent.keyboard('{Enter}')
    expect(resized.slice(0, 2)).toEqual([
      { field: 'age', width: start + 10 },
      { field: 'age', width: start - 50 }
    ])
    // Autofit: the widest rendered content, far below the declared 400px.
    expect(resized[2].field).toBe('age')
    expect(resized[2].width).toBeLessThan(200)
    expect(resized[2].width).toBeGreaterThanOrEqual(40)
    expect(updates).toEqual([])
  })

  test('autofit fits the widest cell of the given rows', async () => {
    const { resized, rerender } = await renderPinned({
      resizable: true,
      rows: [
        { id: 1, name: 'A', age: 1, joined: '2024-01-01' },
        { id: 2, name: 'B', age: 123456789012345, joined: '2024-01-01' }
      ]
    })
    const handle = el('thead th[data-field="age"] .qt-resize-handle')
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(resized).toHaveLength(1)
    await rerender({
      resizable: true,
      columns: wide().map(column =>
        column.field === 'age'
          ? { ...column, width: `${resized[0].width}px` }
          : column
      )
    })
    const table = el('.qt-table')
    table.style.tableLayout = 'fixed'
    await frames(3)
    // The longest value now fits exactly: no overflow, no slack beyond a pixel.
    const cell = el('tbody tr[data-row-index="1"] td[data-field="age"]')
    expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth)
    expect(cell.getBoundingClientRect().width).toBeLessThanOrEqual(
      resized[0].width + 2
    )
  })
})

describe.each<Theme>(['light', 'dark'])(
  'C-48 accessibility scan with pinned and resizable columns (axe), %s theme',
  theme => {
    test('finds no violation', async () => {
      await renderPinned({ resizable: true, theme })
      const result = await axe.run(el('.qt-datatable'), {
        resultTypes: ['violations']
      })
      expect(result.violations.map(v => v.id)).toEqual([])
    })
  }
)
