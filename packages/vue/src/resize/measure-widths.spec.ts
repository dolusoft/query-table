import { afterEach, describe, expect, it, vi } from 'vitest'

import { measureColumnWidths } from './measure-widths'

// jsdom lays nothing out: each element's width is stubbed, so the rules
// around the read are checked alone. The layout itself is checked in the
// browser tests (auto-width.browser.spec, measure-widths.browser.spec).

/** A width, or one that follows the width the read gives the filter row. */
type Width = number | ((row: number) => number)
const widths = new Map<Element, Width>()

const box = (element: Element, width: Width) => {
  widths.set(element, width)
  return element
}

const rect = (width: number) =>
  ({ width, right: width, left: 0 }) as unknown as DOMRect

/** The inline `width` of the filter row around an element, in pixels. */
const rowWidth = (element: Element) =>
  parseFloat(element.closest<HTMLElement>('.qt-filter')?.style.width ?? '') || 0

vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
  function (this: Element) {
    const width = widths.get(this) ?? 0
    return rect(typeof width === 'number' ? width : width(rowWidth(this)))
  }
)

afterEach(() => {
  widths.clear()
  document.body.innerHTML = ''
})

/** A table with one header row; each header is `[field, width, filter?]`. */
const tableOf = (
  headers: [string, number, ((th: HTMLElement) => void)?][]
): HTMLTableElement => {
  const table = document.createElement('table')
  const tr = table.createTHead().insertRow()
  for (const [field, width, filter] of headers) {
    const th = document.createElement('th')
    th.dataset.field = field
    box(th, width)
    filter?.(th)
    tr.append(th)
  }
  document.body.append(table)
  return table
}

const filterRow = (th: HTMLElement, ...controls: HTMLElement[]) => {
  const row = document.createElement('div')
  row.className = 'qt-filter'
  row.style.columnGap = '4px'
  row.append(...controls)
  th.append(row)
  return row
}

const control = (tag: string, className: string, width: Width) => {
  const element = document.createElement(tag)
  element.className = className
  return box(element, width) as HTMLElement
}

describe('C-100 measureColumnWidths with the filter floor', () => {
  it('measures nothing without a header', () => {
    expect(measureColumnWidths(document.createElement('table'))).toEqual({})
    expect(measureColumnWidths(null)).toEqual({})
  })

  it('counts the filter controls side by side as a floor, with the gap and the cell padding', () => {
    const table = tableOf([
      [
        'id',
        30,
        th => {
          th.style.padding = '0 8px'
          filterRow(
            th,
            control('input', 'qt-filter-input', 60),
            control('button', 'qt-filter-button', 32)
          )
        }
      ],
      [
        'name',
        300,
        th => filterRow(th, control('input', 'qt-filter-input', 60))
      ]
    ])
    expect(
      measureColumnWidths(table, undefined, null, { filters: true })
    ).toEqual({ id: 60 + 32 + 4 + 16, name: 300 })
    // Without the option the filter row does not count (C-99).
    expect(measureColumnWidths(table)).toEqual({ id: 30, name: 300 })
  })

  it('leaves out a control positioned out of the flow, one with no box, and a row with none', () => {
    const fixed = control('input', 'qt-filter-input', 200)
    fixed.style.position = 'fixed'
    const table = tableOf([
      [
        'id',
        30,
        th => filterRow(th, fixed, control('button', 'qt-filter-button', 32))
      ],
      [
        'code',
        20,
        th => filterRow(th, control('select', 'qt-filter-input', 0))
      ],
      ['plain', 25]
    ])
    expect(
      measureColumnWidths(table, undefined, null, { filters: true })
    ).toEqual({ id: 32, code: 20, plain: 25 })
  })

  it('gives six characters to a text or number input only; a date input draws its own width', () => {
    const seen: Record<string, string> = {}
    const input = (type: string) => {
      const element = control('input', 'qt-filter-input', () => {
        seen[type] = element.style.width
        return 50
      })
      ;(element as HTMLInputElement).type = type
      return element
    }
    const table = tableOf([
      ['a', 30, th => filterRow(th, input('text'))],
      ['b', 30, th => filterRow(th, input('number'))],
      ['c', 30, th => filterRow(th, input('date'))],
      ['d', 30, th => filterRow(th, input('datetime-local'))]
    ])
    measureColumnWidths(table, undefined, null, { filters: true })
    expect(seen).toEqual({
      text: '6ch',
      number: '6ch',
      date: 'auto',
      'datetime-local': 'auto'
    })
  })

  it('puts a button a narrow form laid absolute back in the row, and counts only the row’s own buttons', () => {
    const laid = control('button', 'qt-filter-button', 32)
    laid.style.position = 'absolute'
    const nested = document.createElement('span')
    nested.append(control('button', 'qt-filter-button', 500))
    const table = tableOf([
      [
        'id',
        30,
        th =>
          filterRow(th, control('input', 'qt-filter-input', 50), laid, nested)
      ]
    ])
    expect(
      measureColumnWidths(table, undefined, null, { filters: true }).id
    ).toBe(50 + 4 + 32)
    expect(laid.style.position).toBe('absolute')
  })

  it('solves a percentage padding at the width the column is drawn at', () => {
    // An input 50px wide plus 30% of the row: the row needs R with
    // R = 50 + 0.3 R + 4 + 32, so the input keeps its 50px at that width.
    const table = tableOf([
      [
        'id',
        30,
        th =>
          filterRow(
            th,
            control('input', 'qt-filter-input', row => 50 + 0.3 * row),
            control('button', 'qt-filter-button', 32)
          )
      ]
    ])
    expect(
      measureColumnWidths(table, undefined, null, { filters: true }).id
    ).toBe(Math.ceil((50 + 4 + 32) / 0.7))
  })

  it('counts no slot content, whatever its width or the width it follows', () => {
    const slot = (width: Width) => {
      const element = document.createElement('div')
      return box(element, width) as HTMLElement
    }
    const floorWith = (extra: HTMLElement) => {
      const table = tableOf([
        [
          'id',
          30,
          th =>
            filterRow(
              th,
              control('input', 'qt-filter-input', row => 50 + 0.3 * row),
              control('button', 'qt-filter-button', 32),
              extra
            )
        ]
      ])
      const width = measureColumnWidths(table, undefined, null, {
        filters: true
      }).id
      table.remove()
      return width
    }
    const alone = floorWith(slot(0))
    expect(floorWith(slot(400))).toBe(alone)
    // Content that takes the row's width does not feed back either.
    expect(floorWith(slot(row => row))).toBe(alone)
    expect(floorWith(slot(row => row))).toBe(alone)
  })

  it('leaves out a column with no box: the table is not displayed', () => {
    const table = tableOf([
      ['id', 0, th => filterRow(th, control('input', 'qt-filter-input', 60))]
    ])
    expect(
      measureColumnWidths(table, undefined, null, { filters: true })
    ).toEqual({})
  })

  it('with a body table a column takes the wider of its header and its cells', () => {
    const table = tableOf([
      ['id', 30],
      ['name', 50]
    ])
    const body = document.createElement('table')
    body.append(document.createElement('colgroup'))
    body.querySelector('colgroup')!.append(document.createElement('col'))
    const tr = body.createTBody().insertRow()
    tr.dataset.rowIndex = '0'
    const cell = tr.insertCell()
    cell.dataset.field = 'id'
    box(cell, 70)
    body.tBodies[0].insertRow()
    document.body.append(body)
    expect(measureColumnWidths(table, ['id', 'name'], body)).toEqual({
      id: 70,
      name: 50
    })
  })

  it('puts every style back, absent included', () => {
    let input!: HTMLElement
    let select!: HTMLElement
    let row!: HTMLElement
    const table = tableOf([
      [
        'id',
        30,
        th => {
          input = control('input', 'qt-filter-input', 60)
          select = control('select', 'qt-filter-input', 40)
          row = filterRow(th, input, select)
        }
      ]
    ])
    const before = row.getAttribute('style')
    measureColumnWidths(table, ['id'], null, { filters: true })
    expect(input.getAttribute('style')).toBeNull()
    expect(select.getAttribute('style')).toBeNull()
    expect(row.getAttribute('style')).toBe(before)
  })
})
