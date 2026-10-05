import { describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'

import { columns, el, renderTable, rows, shot } from '../support/helpers'

// Acceptance measurements on the real layout the test skin gives the plain
// table markup. Every number here comes from getBoundingClientRect.

const box = (css: string) => el(css).getBoundingClientRect()

/** Left edge of the first text in an element, ignoring its padding. */
const textLeft = (css: string) => {
  const root = el(css)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node && node.textContent!.trim() === '') {
    node = walker.nextNode()
  }
  if (!node) {
    throw new Error(`no text in ${css}`)
  }
  const range = document.createRange()
  range.selectNodeContents(node)
  return range.getBoundingClientRect().left
}

describe('C-31 geometry of the plain markup with the test skin', () => {
  test('the filter input keeps at least 60px next to its button in a 120px column', async () => {
    await renderTable({
      columns: [
        { field: 'name', title: 'Name', width: '120px' },
        { field: 'age', title: 'Age', type: 'number' }
      ]
    })
    const th = box('th[data-field="name"]')
    const input = box('th[data-field="name"] .qt-filter-input')
    const button = box('th[data-field="name"] .qt-filter-button')
    expect(th.width).toBeLessThanOrEqual(121)
    expect(input.width).toBeGreaterThanOrEqual(60)
    // Side by side, not overlaid: the button starts where the input ends.
    expect(button.left).toBeGreaterThanOrEqual(input.right)
    expect(button.right).toBeLessThanOrEqual(th.right)
    expect(
      Math.abs(button.top + button.height / 2 - (input.top + input.height / 2))
    ).toBeLessThanOrEqual(1)
    // Siblings in the markup too.
    expect(
      el('th[data-field="name"] .qt-filter-input').nextElementSibling
    ).toBe(el('th[data-field="name"] .qt-filter-button'))
    await shot('layout-narrow-column')
  })

  test('the date filter does not overflow a 120px column', async () => {
    await renderTable({
      columns: [
        { field: 'joined', title: 'Joined', type: 'date', width: '120px' },
        { field: 'name', title: 'Name' }
      ]
    })
    const cell = el('th[data-field="joined"]')
    const th = cell.getBoundingClientRect()
    const input = box('th[data-field="joined"] .qt-filter-input')
    const button = box('th[data-field="joined"] .qt-filter-button')
    expect(th.width).toBeLessThanOrEqual(121)
    expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth + 1)
    expect(input.right).toBeLessThanOrEqual(th.right)
    expect(button.right).toBeLessThanOrEqual(th.right)
    const scroller = el('.qt-table-responsive')
    expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth)
    await shot('layout-date-filter')
  })

  test('footer and pagination text start where the cell text starts', async () => {
    await renderTable({
      footerRows: [{ cells: [{ field: 'id', text: 'Total' }] }]
    })
    const cell = textLeft('tbody tr:first-child td:first-child')
    const footer = textLeft('tfoot td:first-child')
    const pagination = textLeft('.qt-pagination .page-info')
    expect(Math.abs(footer - cell)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(pagination - cell)).toBeLessThanOrEqual(0.5)
    await shot('layout-footer-and-pagination')
  })

  test.each(['light', 'dark'] as const)(
    'typing a filter moves nothing while the condition label shows up (%s)',
    async theme => {
      const { filterInput } = await renderTable({ theme })
      const measure = () => {
        const input = box('th[data-field="name"] .qt-filter-input')
        return {
          inputX: input.x,
          inputWidth: input.width,
          headerHeight: box('thead tr').height,
          columns: [...document.querySelectorAll('thead th')].map(
            cell => cell.getBoundingClientRect().width
          )
        }
      }
      const before = measure()
      await userEvent.type(filterInput('name'), 'N')
      await expect
        .element(document.querySelector<HTMLElement>('.qt-filter-condition'))
        .toBeInTheDocument()
      expect(measure()).toEqual(before)
      await userEvent.type(filterInput('name'), 'ame 1')
      expect(measure()).toEqual(before)
      await shot(`layout-filter-label-${theme}`)
    }
  )

  test('header content is centered vertically in every header cell', async () => {
    await renderTable({
      hasSubtable: true,
      hasRightPanel: true,
      columns: [
        ...columns().slice(0, 3),
        // No filter, no sort: a short cell in a tall row.
        { field: 'joined', title: 'Joined', filterable: false, sortable: false }
      ]
    })
    const cells = [...document.querySelectorAll('thead th')]
    expect(cells.length).toBeGreaterThanOrEqual(6)
    for (const cell of cells) {
      const outer = cell.getBoundingClientRect()
      const inner = [...cell.children].map(child =>
        child.getBoundingClientRect()
      )
      if (inner.length === 0) {
        continue
      }
      const top = Math.min(...inner.map(r => r.top))
      const bottom = Math.max(...inner.map(r => r.bottom))
      expect(
        Math.abs((top + bottom) / 2 - (outer.top + outer.bottom) / 2),
        `th ${cell.getAttribute('data-field') ?? 'utility'}`
      ).toBeLessThanOrEqual(1)
    }
  })

  test('the table writes no inline style except a column width', async () => {
    await renderTable({
      hasSubtable: true,
      hasRightPanel: true,
      rows: rows(3),
      columns: [
        { field: 'id', title: 'ID', type: 'number', width: '90px' },
        { field: 'name', title: 'Name' },
        { field: 'joined', title: 'Joined', type: 'date' }
      ],
      footerRows: [{ cells: [{ field: 'id', text: 'Total' }] }]
    })
    await userEvent.click(el('.qt-expand'))
    const styled = [...el('.qt-datatable').querySelectorAll('[style]')].filter(
      // The filter popover and the shadcn controls are the consumer's.
      node =>
        !node.closest('[data-slot]') && node.getAttribute('data-slot') === null
    )
    expect(styled.map(node => node.tagName)).toEqual(['TH'])
    expect(styled[0].getAttribute('data-field')).toBe('id')
    expect((styled[0] as HTMLElement).style.cssText.replace(/\s/g, '')).toBe(
      'width:90px;'
    )
  })

  test('a full table looks right', async () => {
    await renderTable({
      hasSubtable: true,
      hasRightPanel: true,
      footerRows: [
        {
          cells: [
            { field: 'id', text: 'Total' },
            { field: 'age', text: 110 }
          ]
        }
      ],
      query: {
        page: 2,
        pageSize: 10,
        sort: { field: 'age', direction: 'desc' },
        filters: [{ field: 'name', condition: 'Contains', value: 'Name' }]
      }
    })
    await shot('layout-full-table')
  })
})
