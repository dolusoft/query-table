import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'

import { makeQuery } from '../../support/fixtures'
import { renderScenario } from '../../support/scenario-host'

// A keyboard user walks the whole table with Tab: the toolbar, then the
// header (column by column: reorder handle, sort, filter, filter menu,
// resize handle), then the body (row by row: the utility buttons in their
// column order), then the pagination. Every stop shows a focus indicator.

const focusable =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** A readable name of a focus stop. */
const stopName = (element: Element | null): string => {
  if (!element) {
    return 'nothing'
  }
  const th = element.closest('th[data-field]')
  const row = element.closest('tr[data-row-index]')
  const cls = [...element.classList].find(name => name.startsWith('qt-'))
  const name =
    cls ??
    element.getAttribute('aria-label') ??
    element.textContent?.trim() ??
    element.tagName
  if (th) {
    return `${(th as HTMLElement).dataset.field}:${name}`
  }
  if (row) {
    return `row${(row as HTMLElement).dataset.rowIndex}:${name}`
  }
  return name
}

/** What the focused element looks like: outline, ring, its `::after` line. */
const look = (element: Element) => {
  const own = getComputedStyle(element)
  const after = getComputedStyle(element, '::after')
  return [
    own.outlineStyle,
    own.outlineWidth,
    own.outlineColor,
    own.boxShadow,
    own.borderColor,
    after.backgroundColor,
    after.boxShadow
  ].join('|')
}

test('C-45 C-48 C-64 C-73 Tab walks toolbar, header, body and pagination in order, with a visible focus at every stop', async () => {
  const flow = await renderScenario({
    initial: makeQuery({ pageSize: 5 }),
    selection: true,
    subtable: true,
    rightPanel: true,
    props: { reorderable: true, resizable: true }
  })
  const root = flow.root()
  // The stops in document order. A date input is one stop for the walk
  // below even though Tab steps through its parts.
  const stops = [...root.querySelectorAll<HTMLElement>(focusable)].filter(
    element => element.getClientRects().length > 0
  )
  const unfocused = new Map(stops.map(element => [element, look(element)]))

  const search = root.querySelector<HTMLInputElement>('input[type="search"]')!
  search.focus()
  const walk: HTMLElement[] = [search]
  for (let i = 0; i < 200 && walk.length < stops.length; i++) {
    await userEvent.keyboard('{Tab}')
    const active = document.activeElement as HTMLElement
    if (!root.contains(active)) {
      break
    }
    if (active !== walk[walk.length - 1]) {
      walk.push(active)
      // The indicator may fade in (`transition`): wait for it.
      await expect
        .poll(() => look(active), { timeout: 2000 })
        .not.toBe(unfocused.get(active))
      expect(active.matches(':focus-visible'), stopName(active)).toBe(true)
    }
  }
  expect(walk.map(stopName)).toEqual(stops.map(stopName))
  expect(walk).toEqual(stops)

  const names = walk.map(stopName)
  // Toolbar, then the header: the clear-all button is disabled with no
  // filter, so the header starts with the select-all checkbox.
  expect(names.slice(0, 3)).toEqual(['Search', 'Reload', 'qt-select-all'])
  // Inside a header cell: reorder handle, sort, filter input, filter menu
  // button, resize handle; the columns in their order.
  const header = names.filter(name => /^[a-z]+:/.test(name))
  expect(header.slice(0, 5)).toEqual([
    'id:qt-reorder-handle',
    'id:qt-sort',
    'id:qt-filter-input',
    'id:qt-filter-button',
    'id:qt-resize-handle'
  ])
  expect([...new Set(header.map(name => name.split(':')[0]))]).toEqual([
    'id',
    'name',
    'age',
    'joined'
  ])
  // The body, row by row: right panel, expand, select. Nothing in the data
  // cells is focusable.
  const body = names.filter(name => name.startsWith('row'))
  expect(body).toEqual(
    [0, 1, 2, 3, 4].flatMap(row => [
      `row${row}:qt-right-panel-button`,
      `row${row}:qt-expand`,
      `row${row}:qt-select-row`
    ])
  )
  // Header before body before pagination.
  const lastHeader = names.lastIndexOf(header[header.length - 1])
  expect(names.indexOf(body[0])).toBeGreaterThan(lastHeader)
  // The pagination: the page size, then Next (Previous is disabled on
  // page 1).
  expect(names.slice(-2)).toEqual(['Rows per page', 'Next'])

  // The utility cells line up with their header cells: the header cell of a
  // utility column sits at the same column index as the body cell.
  const headRow = root.querySelector('thead > tr')!
  const firstRow = root.querySelector('tbody > tr[data-row-index="0"]')!
  const indexOf = (row: Element, css: string) =>
    (row.querySelector(css)!.closest('td, th') as HTMLTableCellElement)
      .cellIndex
  expect(indexOf(headRow, '.qt-select-all')).toBe(
    indexOf(firstRow, '.qt-select-row')
  )
  expect(indexOf(firstRow, '.qt-right-panel-button')).toBe(0)
  expect(indexOf(firstRow, '.qt-expand')).toBe(1)
  expect(indexOf(firstRow, '.qt-select-row')).toBe(2)
  expect(indexOf(headRow, '.qt-clear-all-button')).toBe(0)

  // Shift+Tab walks the same stops back.
  const back: HTMLElement[] = [document.activeElement as HTMLElement]
  for (let i = 0; i < 6; i++) {
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    const active = document.activeElement as HTMLElement
    if (active !== back[back.length - 1]) {
      back.push(active)
    }
  }
  expect(back).toEqual(walk.slice(-back.length).reverse())
  expect(flow.updates).toEqual([])
})
