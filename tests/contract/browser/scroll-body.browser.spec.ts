import axe from 'axe-core'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi
} from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'

import type { Column } from '@dolusoft/query-table'

import { makeQuery, rows } from '../../support/fixtures'
import { renderTable } from '../../support/helpers'
import {
  drawnIndexes,
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  type HostApi
} from '../../support/scroll-host'

// C-101 and C-102: `scrollBody` in a real browser, with the test skin. The
// page gives the body its height and the columns their widths, so the body
// scrolls both ways.

let style: HTMLStyleElement
beforeAll(() => {
  style = document.createElement('style')
  // The layout the README gives for a table that scrolls sideways.
  style.textContent = [
    '.qt-table-body { height: 200px; }',
    '.qt-table.qt-table { width: max-content; min-width: 100%; }'
  ].join(' ')
  document.head.append(style)
})
afterAll(() => style.remove())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Wide enough to scroll sideways in the 1280px viewport. */
const wide = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number', width: '120px', pinned: 'left' },
  { field: 'name', title: 'Name', width: '500px' },
  { field: 'age', title: 'Age', type: 'number', width: '500px' },
  { field: 'joined', title: 'Joined', type: 'date', width: '500px' }
]

const footerRows = [{ cells: [{ field: 'id', text: 'Total' }] }]

const mount = async (props: Record<string, unknown> = {}) => {
  const table = await renderTable({
    scrollBody: true,
    columns: wide(),
    rows: rows(40),
    totalRows: 40,
    query: makeQuery({ pageSize: 40 }),
    footerRows,
    rowKey: 'id',
    ...props
  })
  await frames(3)
  return table
}

/** The scroll host of the virtual specs, the body its only scroller. */
const mountHost = async (tableProps: Record<string, unknown>, count = 1000) => {
  let api: HostApi | null = null
  await render(ScrollHost as never, {
    props: {
      rows: scrollRows(count),
      tableProps: { scrollBody: true, ...tableProps },
      height: 0,
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(4)
  return api!
}

const part = (name: 'head' | 'body' | 'foot') =>
  document.querySelector<HTMLElement>(`.qt-table-${name}`)!

const box = (element: Element) => element.getBoundingClientRect()

/** Left and right edge of every cell of a row, rounded to a tenth. */
const edges = (row: Element) =>
  [...row.children].map(cell => {
    const { left, right } = box(cell)
    return [Math.round(left * 10) / 10, Math.round(right * 10) / 10]
  })

const headRow = () => document.querySelector('.qt-table-head thead > tr')!
const bodyRow = () =>
  document.querySelector('.qt-table-body tbody > tr[data-row-index]')!
const footRow = () => document.querySelector('.qt-table-foot tfoot > tr')!

describe('C-101 Scrolling body [own]', () => {
  test('draws the header, the body and the footer as three tables, one wrapper each', async () => {
    await mount()
    const root = document.querySelector('.qt-table-responsive')!
    expect([...root.children].map(child => child.className)).toEqual([
      'qt-table-head',
      'qt-table-body',
      'qt-table-foot'
    ])
    for (const name of ['head', 'body', 'foot'] as const) {
      const tables = part(name).querySelectorAll(':scope > table.qt-table')
      expect(tables).toHaveLength(1)
      // The wrappers are the consumer's to style.
      expect(part(name).hasAttribute('style')).toBe(false)
    }
    expect(part('head').querySelector(':scope > table > thead')).not.toBeNull()
    expect(part('head').querySelector('tbody, tfoot')).toBeNull()
    expect(part('body').querySelector(':scope > table > tbody')).not.toBeNull()
    expect(part('body').querySelector('thead, tfoot')).toBeNull()
    expect(part('foot').querySelector(':scope > table > tfoot')).not.toBeNull()
    expect(root.hasAttribute('style')).toBe(false)
  })

  test('draws no footer wrapper without footer rows', async () => {
    await mount({ footerRows: [] })
    expect(document.querySelector('.qt-table-foot')).toBeNull()
  })

  test('the body scrolls under the header: the scrollbar starts below it and the header stays', async () => {
    await mount()
    const body = part('body')
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight)
    expect(box(body).top).toBeGreaterThanOrEqual(box(part('head')).bottom - 0.5)
    const headTop = box(headRow()).top
    body.scrollTop = 300
    await frames(2)
    expect(box(headRow()).top).toBe(headTop)
    // The first rows went up behind the header's lower edge, not under it.
    const first = document.querySelector(
      '.qt-table-body tr[data-row-index="0"]'
    )!
    expect(box(first).bottom).toBeLessThan(box(body).top)
  })

  test('the body and footer columns are as wide as the header cells, in a `col` each', async () => {
    await mount()
    const cols = [...part('body').querySelectorAll('colgroup > col')]
    expect(cols).toHaveLength(headRow().children.length)
    expect(part('foot').querySelectorAll('colgroup > col')).toHaveLength(
      cols.length
    )
    const widths = [...headRow().children].map(cell => box(cell).width)
    cols.forEach((col, i) => {
      expect(parseFloat((col as HTMLElement).style.width)).toBeCloseTo(
        widths[i],
        1
      )
    })
    expect(edges(bodyRow())).toEqual(edges(headRow()))
    expect(edges(footRow())).toEqual(edges(headRow()))
  })

  test('the columns follow a header cell that changes width', async () => {
    const { rerender } = await mount()
    const columns = wide()
    columns[1] = { ...columns[1], width: '300px' }
    await rerender({ columns })
    await frames(3)
    expect(box(headRow().children[1]).width).toBeCloseTo(300, 0)
    expect(edges(bodyRow())).toEqual(edges(headRow()))
    expect(edges(footRow())).toEqual(edges(headRow()))
  })

  test('header, body and footer scroll sideways together', async () => {
    await mount()
    const body = part('body')
    expect(body.scrollWidth).toBeGreaterThan(body.clientWidth)
    body.scrollLeft = 200
    await frames(2)
    expect(part('head').scrollLeft).toBe(body.scrollLeft)
    expect(part('foot').scrollLeft).toBe(body.scrollLeft)
    expect(edges(bodyRow())).toEqual(edges(headRow()))
    expect(edges(footRow())).toEqual(edges(headRow()))
    // The pinned cell stays at the left edge of all three.
    const pinned = (row: Element) => box(row.children[0]).left
    expect(pinned(bodyRow())).toBe(pinned(headRow()))
    expect(pinned(footRow())).toBe(pinned(headRow()))
  })

  test('a header scrolled by the focus takes the body with it', async () => {
    // The last filter input starts out of view.
    await mount({
      columns: wide().map(column =>
        column.field === 'joined' ? column : { ...column, width: '700px' }
      )
    })
    const input = document.querySelector<HTMLElement>(
      '.qt-table-head th[data-field="joined"] .qt-filter-input'
    )!
    input.focus()
    await frames(2)
    expect(part('head').scrollLeft).toBeGreaterThan(0)
    expect(part('body').scrollLeft).toBe(part('head').scrollLeft)
    expect(part('foot').scrollLeft).toBe(part('head').scrollLeft)
    expect(edges(bodyRow())).toEqual(edges(headRow()))
  })

  test('a footer drawn later starts where the body is', async () => {
    const { rerender } = await mount({ footerRows: [] })
    part('body').scrollLeft = 150
    await frames(2)
    await rerender({ footerRows })
    await frames(2)
    expect(part('foot').scrollLeft).toBe(part('body').scrollLeft)
  })

  test('a virtual body scrolls in the body wrapper, and `scrollToIndex` aligns to its top', async () => {
    const api = await mountHost({ virtual: true })
    const body = part('body')
    expect(drawnIndexes().length).toBeLessThan(100)
    await scrollTo(body, 8000)
    expect(Math.min(...drawnIndexes())).toBeGreaterThan(100)
    expect(window.scrollY).toBe(0)
    api.table().scrollToIndex(500, { align: 'start' })
    await frames(6)
    const row = document.querySelector(
      '.qt-table-body tbody > tr[data-row-index="500"]'
    )!
    // No header inside the body covers its top edge.
    expect(Math.abs(box(row).top - box(body).top)).toBeLessThan(1.5)
    expect(edges(bodyRow())).toEqual(edges(headRow()))
  })

  test('infinite scroll asks for the next page at the end of the body', async () => {
    const api = await mountHost({ infinite: true }, 50)
    expect(api.events).toHaveLength(0)
    const body = part('body')
    await scrollTo(body, body.scrollHeight)
    await frames(4)
    expect(api.events.map(([, reason]) => reason)).toEqual(['page'])
  })

  test('`measureColumnWidths` counts the body cells of their own table', async () => {
    const long = rows(3).map(row => ({ ...row, name: 'x'.repeat(80) }))
    await mount({
      columns: [
        { field: 'id', title: 'ID', type: 'number' },
        { field: 'name', title: 'Name' }
      ],
      rows: long,
      autoWidth: true,
      footerRows: []
    })
    await frames(3)
    const name = box(headRow().children[1]).width
    // The header label is short; the automatic width is the body's.
    expect(name).toBeGreaterThan(400)
    expect(edges(bodyRow())).toEqual(edges(headRow()))
  })

  test('warns once in development when the body table has the automatic layout', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const auto = document.createElement('style')
    auto.textContent =
      '.qt-table-body > .qt-table.qt-table { table-layout: auto; }'
    document.head.append(auto)
    try {
      await mount()
      expect(
        warn.mock.calls.filter(call => String(call[0]).includes('scrollBody'))
      ).toHaveLength(1)
    } finally {
      auto.remove()
    }
  })
})

describe('C-102 Scrolling body: one table for assistive technology [own]', () => {
  test('the wrapper is the table, the three tables are presentation, rows and cells have roles', async () => {
    await mount({ hasSubtable: true })
    await userEvent.click(document.querySelector('.qt-expand')!)
    const root = document.querySelector('.qt-table-responsive')!
    expect(root.getAttribute('role')).toBe('table')
    for (const table of root.querySelectorAll('table')) {
      expect(table.getAttribute('role')).toBe('presentation')
    }
    for (const group of root.querySelectorAll('thead, tbody, tfoot')) {
      expect(group.getAttribute('role')).toBe('rowgroup')
    }
    for (const tr of root.querySelectorAll('tr')) {
      expect(tr.getAttribute('role')).toBe('row')
    }
    for (const th of root.querySelectorAll('th')) {
      expect(th.getAttribute('role')).toBe('columnheader')
    }
    for (const td of root.querySelectorAll('td')) {
      expect(td.getAttribute('role')).toBe('cell')
    }
    const spanning = root.querySelector('.qt-subtable-row > td')!
    expect(spanning.getAttribute('aria-colspan')).toBe(
      spanning.getAttribute('colspan')
    )
  })

  test('the accessibility tree is one table whose column headers are the header cells', async () => {
    await mount()
    const tree = await commands.ariaSnapshot('.qt-table-responsive')
    const lines = tree.split('\n').map(line => line.trim())
    expect(lines.filter(line => line.startsWith('- table'))).toHaveLength(1)
    for (const title of ['ID', 'Name', 'Age', 'Joined']) {
      expect(tree).toContain(`- columnheader "${title}`)
    }
    expect(tree).toContain('- cell "Name 1"')
    expect(tree).toContain('- cell "Total"')
  })

  test('virtual: `aria-rowcount` is on the table role, not on a `table` element', async () => {
    await mount({ virtual: true })
    const root = document.querySelector('.qt-table-responsive')!
    // Header, 40 rows, footer.
    expect(root.getAttribute('aria-rowcount')).toBe('42')
    expect(root.querySelector('table[aria-rowcount]')).toBeNull()
  })

  test('the axe scan finds no violation', async () => {
    await mount({ hasSubtable: true, hasRightPanel: true })
    await userEvent.click(document.querySelector('.qt-expand')!)
    const result = await axe.run(document.querySelector('.qt-datatable')!, {
      resultTypes: ['violations']
    })
    expect(
      result.violations.map(
        violation =>
          `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`
      )
    ).toEqual([])
  })

  test('without `scrollBody` no role is written', async () => {
    await mount({ scrollBody: false, hasSubtable: true })
    expect(document.querySelector('.qt-datatable [role]')).toBeNull()
    expect(document.querySelector('.qt-table-head, .qt-table-body')).toBeNull()
  })
})
