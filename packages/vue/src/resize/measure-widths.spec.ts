import { afterEach, describe, expect, it, vi } from 'vitest'

import { measureColumnWidths } from './measure-widths'

// jsdom lays nothing out: each element's width is stubbed, so the rules
// around the read are checked alone. The layout itself is checked in the
// browser tests (auto-width.browser.spec, measure-widths.browser.spec).

const widths = new Map<Element, number>()

const box = (element: Element, width: number) => {
  widths.set(element, width)
  return element
}

const rect = (width: number) =>
  ({ width, right: width, left: 0 }) as unknown as DOMRect

vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
  function (this: Element) {
    return rect(widths.get(this) ?? 0)
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

const control = (tag: string, className: string, width: number) => {
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
