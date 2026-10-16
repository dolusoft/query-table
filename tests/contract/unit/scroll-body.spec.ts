import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { mountTable, type Mounted } from '../../support/mount-table'

// C-101 and C-102: the markup of `scrollBody` without a layout. The widths,
// the scrolling and the accessibility tree need a browser
// (scroll-body.browser.spec); this checks the parts, the roles and that
// nothing changes with the prop off.

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

const footerRows = [{ cells: [{ field: 'age', text: 'Total' }] }]

const everything = {
  scrollBody: true,
  rowKey: 'id',
  hasSubtable: true,
  hasRightPanel: true,
  selection: {},
  filterable: true,
  footerRows
}

describe('C-101 Scrolling body (unit) [own]', () => {
  it('draws three tables, one in each wrapper, and a `col` per header cell', () => {
    const m = mountIt(everything)
    const root = m.wrapper.find('.qt-table-responsive')
    expect(root.element.children).toHaveLength(3)
    expect([...root.element.children].map(child => child.className)).toEqual([
      'qt-table-head',
      'qt-table-body',
      'qt-table-foot'
    ])
    expect(m.wrapper.findAll('table.qt-table')).toHaveLength(3)
    const headerCells = m.wrapper.findAll('.qt-table-head thead > tr > *')
    // Three utilities and four columns.
    expect(headerCells).toHaveLength(7)
    expect(m.wrapper.findAll('.qt-table-body colgroup > col')).toHaveLength(7)
    expect(m.wrapper.findAll('.qt-table-foot colgroup > col')).toHaveLength(7)
    expect(m.wrapper.find('.qt-table-head tbody').exists()).toBe(false)
    expect(m.wrapper.find('.qt-table-body thead').exists()).toBe(false)
    expect(m.wrapper.find('.qt-table-foot tfoot').exists()).toBe(true)
  })

  it('draws no footer wrapper without footer rows, and one once they come', async () => {
    const m = mountIt({ ...everything, footerRows: [] })
    expect(m.wrapper.find('.qt-table-foot').exists()).toBe(false)
    await m.wrapper.setProps({ footerRows })
    expect(m.wrapper.find('.qt-table-foot tfoot').exists()).toBe(true)
  })

  it('draws the one table of 3.7 when turned off', async () => {
    const m = mountIt(everything)
    await m.wrapper.setProps({ scrollBody: false })
    await nextTick()
    expect(m.wrapper.find('.qt-table-head').exists()).toBe(false)
    expect(m.wrapper.findAll('table')).toHaveLength(1)
    expect(m.wrapper.find('table > thead').exists()).toBe(true)
    expect(m.wrapper.find('table > tbody').exists()).toBe(true)
    expect(m.wrapper.find('table > tfoot').exists()).toBe(true)
    expect(m.wrapper.find('col').exists()).toBe(false)
  })

  it('measures columns of a table that is not laid out as nothing', () => {
    const m = mountIt(everything)
    const exposed = m.wrapper.vm as unknown as {
      measureColumnWidths: (fields?: string[]) => Record<string, number>
    }
    expect(exposed.measureColumnWidths()).toEqual({})
    expect(exposed.measureColumnWidths(['name'])).toEqual({})
  })
})

describe('C-102 Scrolling body: roles (unit) [own]', () => {
  it('gives the wrapper the table role and every part its role', async () => {
    const m = mountIt(everything)
    await m.wrapper.find('.qt-expand').trigger('click')
    const root = m.wrapper.find('.qt-table-responsive')
    expect(root.attributes('role')).toBe('table')
    for (const table of m.wrapper.findAll('table')) {
      expect(table.attributes('role')).toBe('presentation')
    }
    for (const group of m.wrapper.findAll('thead, tbody, tfoot')) {
      expect(group.attributes('role')).toBe('rowgroup')
    }
    for (const tr of m.wrapper.findAll('tr')) {
      expect(tr.attributes('role')).toBe('row')
    }
    for (const th of m.wrapper.findAll('th')) {
      expect(th.attributes('role')).toBe('columnheader')
    }
    for (const td of m.wrapper.findAll('td')) {
      expect(td.attributes('role')).toBe('cell')
    }
  })

  it('gives every spanning cell its `aria-colspan`', async () => {
    const m = mountIt(everything)
    await m.wrapper.find('.qt-expand').trigger('click')
    const spans = m.wrapper.findAll('td[colspan]')
    // The subtable row and the footer's utility cell.
    expect(spans.length).toBeGreaterThanOrEqual(2)
    for (const td of spans) {
      expect(td.attributes('aria-colspan')).toBe(td.attributes('colspan'))
    }
  })

  it('gives the empty, loading and load-more rows their roles', async () => {
    const m = mountIt(
      { ...everything, rows: [], totalRows: 0 },
      {
        slots: {
          empty: '<span>none</span>',
          loading: '<span>wait</span>',
          'load-more': '<button type="button">more</button>'
        }
      }
    )
    const empty = m.wrapper.find('.qt-empty-row')
    expect(empty.attributes('role')).toBe('row')
    expect(empty.find('td').attributes('aria-colspan')).toBe('7')
    await m.wrapper.setProps({ loading: true })
    expect(m.wrapper.find('.qt-loading-row').attributes('role')).toBe('row')
    await m.wrapper.setProps({
      loading: false,
      infinite: true,
      rows: [{ id: 1, name: 'A', age: 1, joined: '2024-01-01' }],
      totalRows: 50
    })
    const more = m.wrapper.find('.qt-load-more-row')
    expect(more.attributes('role')).toBe('row')
    expect(more.find('td').attributes('role')).toBe('cell')
  })

  it('puts `aria-rowcount` of a virtual body on the table role', () => {
    const m = mountIt({ ...everything, virtual: true })
    expect(
      m.wrapper.find('.qt-table-responsive').attributes('aria-rowcount')
    ).toBeDefined()
    expect(m.wrapper.find('table[aria-rowcount]').exists()).toBe(false)
  })

  it('writes no role without `scrollBody`', () => {
    const m = mountIt({ ...everything, scrollBody: false })
    expect(m.wrapper.find('[role]').exists()).toBe(false)
    expect(m.wrapper.find('[aria-colspan]').exists()).toBe(false)
  })
})
