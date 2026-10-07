import { afterEach, expect, test } from 'vitest'
import { cdp, page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { h } from 'vue'

import QueryTable, { type FilterMenuSlotProps } from '@dolusoft/query-table'

import { columns, makeQuery, rows } from '../../support/fixtures'

// The test skin on a touch screen: under `pointer: coarse` every control the
// table draws takes a 44px target (apps/playground/skin/mapping.css). The
// browser tests run with a mouse (`pointer: fine`); Chromium's touch
// emulation over CDP turns the page's primary pointer coarse for one test.

const touch = (enabled: boolean) =>
  cdp().send('Emulation.setTouchEmulationEnabled', {
    enabled,
    // Chromium wants 1 to 16 points even to turn the emulation off.
    maxTouchPoints: 1
  })

afterEach(async () => {
  await touch(false)
})

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
 * The box a tap lands in: from the element's center, how far each way the
 * point still hits the element (or what it holds). An invisible `::after`
 * counts, a neighbour drawn over it does not.
 */
const tapBox = (element: HTMLElement) => {
  element.scrollIntoView({ block: 'center', inline: 'center' })
  const rect = element.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  if (!owns(element, x, y)) {
    return { width: 0, height: 0 }
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
    width: Math.round(right - left + 1),
    height: Math.round(bottom - top + 1)
  }
}

const renderTable = (narrow: boolean) =>
  render(QueryTable as never, {
    props: {
      columns: columns().map(column => ({
        ...column,
        // Under 6rem the filter button sits inside the input's end.
        width: narrow ? '5.5rem' : '12rem'
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

// Pinned to the playground's look on a desktop: the targets a mouse gets.
const FINE = {
  '.qt-clear-all-button': { width: 24, height: 24 },
  '.qt-expand': { width: 24, height: 24 },
  '.qt-right-panel-button': { width: 24, height: 24 },
  '.qt-filter-button': { width: 32, height: 32 }
}

test.each([
  ['wide', false],
  ['narrow', true]
] as const)(
  'on a touch screen every control of the %s table is a 44px target',
  async (_, narrow) => {
    await page.viewport(390, 844)
    await touch(true)
    expect(matchMedia('(pointer: coarse)').matches).toBe(true)
    await renderTable(narrow)
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

test('with a mouse the controls keep their compact size', async () => {
  await page.viewport(1280, 800)
  expect(matchMedia('(pointer: fine)').matches).toBe(true)
  await renderTable(false)
  for (const [selector, size] of Object.entries(FINE)) {
    const rect = document
      .querySelector<HTMLElement>(selector)!
      .getBoundingClientRect()
    expect({ width: rect.width, height: rect.height }, selector).toEqual(size)
  }
  const checkbox = document
    .querySelector<HTMLElement>('.qt-select-row')!
    .getBoundingClientRect()
  expect(checkbox.width).toBeLessThan(20)
})
