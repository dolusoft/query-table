import { expect, test } from 'vitest'
import { render } from 'vitest-browser-vue'
import { h } from 'vue'

import QueryTable, { type FilterMenuSlotProps } from '@dolusoft/query-table'

import { columns, makeQuery, rows } from '../../support/fixtures'
import { tap } from '../../support/touch'

// The test skin on a touch screen: under `pointer: coarse` every control the
// table draws takes a 44px target (apps/playground/skin/mapping.css). This
// runs in the touch instance of the browser project (390x844, a touch
// screen); the mouse side is touch-targets.browser.spec.ts.

const TARGETS = [
  '.qt-sort',
  '.qt-filter-button',
  '.qt-clear-all-button',
  '.qt-expand',
  '.qt-right-panel-button',
  '.qt-reorder-handle',
  '.qt-select-row',
  '.qt-select-all'
]

const owns = (element: Element, x: number, y: number) => {
  const hit = document.elementFromPoint(x, y)
  return hit !== null && element.contains(hit)
}

/**
 * Where a tap lands on the element: from its center, how far each way the
 * point still hits the element (or what it holds). An invisible `::after`
 * counts, a neighbour drawn over it does not.
 */
const tapBox = (element: HTMLElement) => {
  element.scrollIntoView({ block: 'center', inline: 'center' })
  const rect = element.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  if (!owns(element, x, y)) {
    return { left: x, right: x, width: 0, height: 0 }
  }
  let left = x
  let right = x
  let top = y
  let bottom = y
  while (owns(element, left - 1, y)) {
    left--
  }
  while (owns(element, right + 1, y)) {
    right++
  }
  while (owns(element, x, top - 1)) {
    top--
  }
  while (owns(element, x, bottom + 1)) {
    bottom++
  }
  return {
    left,
    right,
    width: Math.round(right - left + 1),
    height: Math.round(bottom - top + 1)
  }
}

// Without a width a column takes the skin's minimum, where the filter
// button sits inside the input's end (a filter row under 6rem).
const renderTable = (width?: string) =>
  render(QueryTable as never, {
    props: {
      columns: columns().map(column => ({
        ...column,
        ...(width === undefined ? {} : { width })
      })),
      rows: rows(3),
      totalRows: 3,
      query: makeQuery(),
      rowKey: 'id',
      sortable: true,
      filterable: true,
      reorderable: true,
      hasRightPanel: true,
      hasSubtable: true,
      selection: {}
    } as never,
    slots: {
      'filter-menu': (menu: FilterMenuSlotProps) => h(menu.trigger),
      subtable: () => h('p', 'Details')
    }
  })

test('the page has a coarse pointer', () => {
  expect(matchMedia('(pointer: coarse)').matches).toBe(true)
})

test.each([
  ['12rem', '12rem'],
  ['5.5rem', '5.5rem'],
  ['auto', undefined]
] as const)(
  'every control of the table with %s columns is a 44px target',
  async (_, width) => {
    await renderTable(width)
    const small: string[] = []
    for (const selector of TARGETS) {
      const elements = [...document.querySelectorAll<HTMLElement>(selector)]
      expect(elements.length, selector).toBeGreaterThan(0)
      for (const element of elements) {
        // A disabled button takes no tap (`pointer-events: none`); its box is
        // the one it gets once enabled.
        const disabled = element.hasAttribute('disabled')
        element.removeAttribute('disabled')
        const box = tapBox(element)
        if (disabled) {
          element.setAttribute('disabled', '')
        }
        if (box.width < 44 || box.height < 44) {
          small.push(`${selector} ${box.width}x${box.height}`)
        }
      }
    }
    expect(small).toEqual([])
  }
)

test.each([
  ['5.5rem', '5.5rem'],
  ['auto', undefined]
] as const)(
  'in a narrow column (%s) a tap in the middle of the filter input lands on the input, and the button target stays in its column',
  async (_, width) => {
    await renderTable(width)
    // Narrow: the filter row is under 6rem and the button sits inside the
    // input's end.
    const cells = [
      ...document.querySelectorAll<HTMLElement>('th[data-field]')
    ].filter(
      cell =>
        cell.querySelector('.qt-filter')!.getBoundingClientRect().width < 96
    )
    expect(cells.length).toBeGreaterThan(0)
    const misses: string[] = []
    for (const cell of cells) {
      const field = cell.dataset.field
      const input = cell.querySelector<HTMLElement>('.qt-filter-input')!
      const button = cell.querySelector<HTMLElement>('.qt-filter-button')!
      input.scrollIntoView({ block: 'center', inline: 'center' })
      const box = input.getBoundingClientRect()
      expect(button.getBoundingClientRect().right, field).toBeLessThanOrEqual(
        box.right
      )
      const y = box.top + box.height / 2
      // The middle and a few points either side of it hit the input.
      for (const dx of [-3, 0, 3]) {
        const x = box.left + box.width / 2 + dx
        if (!owns(input, x, y)) {
          misses.push(
            `${field}: ${document.elementFromPoint(x, y)?.className} at ${dx} from the middle of a ${box.width}px input`
          )
        }
      }
      // The input keeps a 44px target of its own beside the button's.
      const own = tapBox(input)
      if (own.width < 44) {
        misses.push(`${field}: the input keeps ${own.width}px`)
      }
      // The button's invisible target ends inside its own cell: the first
      // point past the cell is not the button's.
      const target = tapBox(button)
      const cellBox = cell.getBoundingClientRect()
      if (target.right > cellBox.right || owns(button, cellBox.right + 1, y)) {
        misses.push(
          `${field}: the button target ends at ${target.right}, the cell at ${cellBox.right}`
        )
      }
    }
    expect(misses).toEqual([])
  }
)

test('in a narrow column a tap on the filter input focuses it', async () => {
  await renderTable('5.5rem')
  const input = document.querySelector('th[data-field="name"] .qt-filter-input')
  await tap('th[data-field="name"] .qt-filter-input')
  expect(document.activeElement).toBe(input)
})
