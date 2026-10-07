import { describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup } from 'vitest-browser-vue'

import { columns, el, renderTable, rows, shot } from '../../support/helpers'

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
    // A text column first: a number column's text ends at the cell edge
    // instead (C-82, the next test).
    const [id, name, ...rest] = columns()
    await renderTable({
      columns: [name, id, ...rest],
      footerRows: [{ cells: [{ field: 'name', text: 'Total' }] }]
    })
    const cell = textLeft('tbody tr:first-child td:first-child')
    const footer = textLeft('tfoot td:first-child')
    const pagination = textLeft('.qt-pagination .page-info')
    expect(Math.abs(footer - cell)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(pagination - cell)).toBeLessThanOrEqual(0.5)
    await shot('layout-footer-and-pagination')
  })

  test('C-82 the skin aligns the cells of a column by its type [own]', async () => {
    await renderTable({
      hasSubtable: true,
      hasRightPanel: true,
      selection: {},
      rowKey: 'id',
      rows: rows(3).map(row => ({ ...row, active: row.id % 2 === 0 })),
      columns: [
        { field: 'name', title: 'Name' },
        { field: 'age', title: 'Age', type: 'number' },
        { field: 'joined', title: 'Joined', type: 'date' },
        { field: 'active', title: 'Active', type: 'bool' }
      ],
      footerRows: [
        {
          cells: [
            { field: 'name', text: 'Total' },
            { field: 'age', text: 63 }
          ]
        }
      ]
    })
    /** Left and right edges of the first text in an element. */
    const text = (css: string) => {
      const left = textLeft(css)
      const root = el(css)
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node && node.textContent!.trim() === '') {
        node = walker.nextNode()
      }
      const range = document.createRange()
      range.selectNodeContents(node!)
      return { left, right: range.getBoundingClientRect().right }
    }
    const inner = (css: string) => {
      const cell = el(css)
      const r = cell.getBoundingClientRect()
      const style = getComputedStyle(cell)
      return {
        // + 1: the 1px border of the cell before it, collapsed into this edge.
        left: r.left + parseFloat(style.paddingLeft) + 1,
        right:
          r.right -
          parseFloat(style.paddingRight) -
          parseFloat(style.borderRightWidth)
      }
    }
    const body = (field: string) =>
      `tbody tr[data-row-index="0"] > td[data-field="${field}"]`

    // Text and dates start at the cell's start.
    for (const field of ['name', 'joined']) {
      expect(
        Math.abs(text(body(field)).left - inner(body(field)).left),
        field
      ).toBeLessThanOrEqual(1.5)
    }
    // Numbers end at the cell's end, in the body, the footer and the header,
    // with digits of one width.
    const end = inner(body('age')).right
    expect(Math.abs(text(body('age')).right - end)).toBeLessThanOrEqual(0.5)
    expect(
      Math.abs(text('tfoot td[data-field="age"]').right - end)
    ).toBeLessThanOrEqual(0.5)
    const sort = box('th[data-field="age"] > .qt-sort')
    expect(Math.abs(sort.right - end)).toBeLessThanOrEqual(0.5)
    // Every body cell has tabular digits already; the type rule gives them
    // to the header too.
    expect(
      getComputedStyle(el('th[data-field="age"]')).fontVariantNumeric
    ).toBe('tabular-nums')
    // The sort icon of an end-aligned header goes before its title.
    expect(box('th[data-field="age"] .qt-sort-icon').right).toBeLessThanOrEqual(
      text('th[data-field="age"] > .qt-sort').left + 0.5
    )
    // The number filter is typed at the end.
    expect(
      getComputedStyle(el('th[data-field="age"] .qt-filter-input')).textAlign
    ).toBe('end')
    // A yes/no column is centered.
    const bool = text(body('active'))
    const boolCell = inner(body('active'))
    expect(
      Math.abs(
        (bool.left + bool.right) / 2 - (boolCell.left + boolCell.right) / 2
      )
    ).toBeLessThanOrEqual(1)
    // The utility cells hold their control in the middle, at a narrow width.
    for (const css of [
      'tbody tr[data-row-index="0"] > td:has(> .qt-select-row)',
      'tbody tr[data-row-index="0"] > td:has(> .qt-expand)',
      'tbody tr[data-row-index="0"] > td:has(> .qt-right-panel-button)',
      'thead th:has(> .qt-select-all)'
    ]) {
      const cell = box(css)
      const control = el(css).firstElementChild!.getBoundingClientRect()
      expect(cell.width, css).toBeLessThanOrEqual(48)
      expect(
        Math.abs(
          (control.left + control.right) / 2 - (cell.left + cell.right) / 2
        ),
        css
      ).toBeLessThanOrEqual(1)
    }
    await shot('layout-column-type-alignment')
    cleanup()

    // With resize handles the last header cell, and the one before the
    // right-pinned cells, keep room for the handle at their end; the body and
    // footer cells under them keep the same, so the column ends at one edge.
    const endsTogether = (field: string) => {
      const cellEnd = text(body(field)).right
      expect(
        Math.abs(text(`tfoot td[data-field="${field}"]`).right - cellEnd),
        `${field} footer`
      ).toBeLessThanOrEqual(0.5)
      expect(
        Math.abs(box(`th[data-field="${field}"] > .qt-sort`).right - cellEnd),
        `${field} header`
      ).toBeLessThanOrEqual(0.5)
    }
    await renderTable({
      resizable: true,
      rows: rows(3),
      columns: [
        { field: 'name', title: 'Name' },
        { field: 'joined', title: 'Joined', type: 'date' },
        { field: 'age', title: 'Age', type: 'number' }
      ],
      footerRows: [{ cells: [{ field: 'age', text: 63 }] }]
    })
    endsTogether('age')
    await shot('layout-column-type-resizable-last')
    cleanup()

    await renderTable({
      resizable: true,
      rows: rows(3),
      columns: [
        { field: 'name', title: 'Name' },
        { field: 'age', title: 'Age', type: 'number' },
        { field: 'id', title: 'ID', type: 'number', pinned: 'right' }
      ],
      footerRows: [{ cells: [{ field: 'age', text: 63 }] }]
    })
    endsTogether('age')
    await shot('layout-column-type-resizable-before-pinned')
  })

  test('C-82 a narrow number header keeps its filter button at the end [own]', async () => {
    // 88px with the resize handles' padding leaves the filter row under 4rem:
    // the input is gone and only the button is left.
    await renderTable({
      resizable: true,
      columns: [
        { field: 'id', title: 'ID', type: 'number', width: '88px' },
        { field: 'name', title: 'Name' }
      ]
    })
    expect(
      getComputedStyle(el('th[data-field="id"] .qt-filter-input')).display
    ).toBe('none')
    const sort = box('th[data-field="id"] > .qt-sort')
    const button = box('th[data-field="id"] .qt-filter-button')
    expect(Math.abs(button.right - sort.right)).toBeLessThanOrEqual(0.5)
    await shot('layout-column-type-narrow-number-filter')
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
    // An empty utility header cell is a `td` (C-45).
    const cells = [...document.querySelectorAll('thead :is(th, td)')]
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

describe('C-52 loading geometry with the test skin', () => {
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
  /** Rects of the header cells, the body rows and the table, rounded. */
  const layout = () =>
    [
      ...document.querySelectorAll(
        '.qt-table, .qt-table thead th, .qt-table tbody > tr[data-row-index], .qt-footer, .qt-pagination'
      )
    ].map(node => {
      const r = node.getBoundingClientRect()
      return [r.x, r.y, r.width, r.height].map(Math.round)
    })

  test('turning loading on and off moves nothing, and the overlay covers the body only', async () => {
    const { rerender } = await renderTable({
      hasSubtable: true,
      footerRows: [{ cells: [{ field: 'id', text: 'Total' }] }]
    })
    await frame()
    const before = layout()
    await rerender({ loading: true })
    await frame()
    expect(layout()).toEqual(before)
    const overlay = box('.qt-loading-row')
    const body = box('.qt-table tbody')
    const head = box('.qt-table thead')
    expect(Math.round(overlay.top)).toBe(Math.round(body.top))
    expect(Math.round(overlay.bottom)).toBe(Math.round(body.bottom))
    expect(Math.round(overlay.left)).toBe(Math.round(body.left))
    expect(Math.round(overlay.width)).toBe(Math.round(body.width))
    expect(overlay.top).toBeGreaterThanOrEqual(head.bottom - 0.5)
    await shot('layout-loading-over-rows')
    await rerender({ loading: false })
    await frame()
    expect(layout()).toEqual(before)
  })

  test('without rows the loading row stays in the flow, as tall as the empty row', async () => {
    const { rerender } = await renderTable({ rows: [], totalRows: 0 })
    await frame()
    const empty = box('.qt-empty-row').height
    await rerender({ loading: true })
    await frame()
    expect(Math.round(box('.qt-loading-row').height)).toBe(Math.round(empty))
    await shot('layout-loading-empty')
  })
})
