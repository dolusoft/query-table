import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

import type { FilterRule, ToolbarSlotProps } from '@dolusoft/query-table'

import {
  flush,
  makeColumns,
  makeQuery,
  mountTable,
  type Mounted
} from '../../support/mount-table'

// C-121: `header: false` draws no `thead`; what is measured from the header
// cells is off. The scroll alignment and the row count of a virtual body are
// in tests/contract/browser/headerless.browser.spec.ts.

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

type Exposed = {
  focusFilter(field: string): boolean
  measureColumnWidths(fields?: string[]): Record<string, number>
}
const exposed = (m: Mounted) => m.wrapper.vm as unknown as Exposed

const fieldsOfFirstRow = (m: Mounted) =>
  m.wrapper
    .findAll('tbody > tr[data-row-index="0"] > td[data-field]')
    .map(cell => cell.attributes('data-field'))

describe('C-121 A table without a header', () => {
  it('draws no thead, nor what sits in it', () => {
    const everything = {
      sortable: true,
      filterable: true,
      resizable: true,
      reorderable: true,
      hasRightPanel: true
    }
    const inHeader = [
      'thead',
      'th',
      '.qt-filter-input',
      '.qt-sort',
      '.qt-resize-handle',
      '.qt-reorder-handle',
      '.qt-clear-all-button'
    ]
    // Each of them is there with the header.
    const withHeader = mountIt(everything)
    for (const selector of inHeader) {
      expect(withHeader.wrapper.find(selector).exists(), selector).toBe(true)
    }
    withHeader.wrapper.unmount()

    const m = mountIt({ ...everything, header: false })
    for (const selector of inHeader) {
      expect(m.wrapper.find(selector).exists(), selector).toBe(false)
    }
    expect(m.wrapper.findAll('tbody > tr[data-row-index]')).toHaveLength(5)
    expect(exposed(m).focusFilter('name')).toBe(false)
    expect(exposed(m).measureColumnWidths()).toEqual({})
  })

  it('keeps the sort and the filters of the query, and the toolbar clears them', async () => {
    let toolbar: ToolbarSlotProps | null = null
    const filters: FilterRule[] = [
      { field: 'name', condition: 'Contains', value: 'a' }
    ]
    const m = mountIt(
      {
        header: false,
        filterable: true,
        query: makeQuery({ sort: { field: 'age', direction: 'asc' }, filters })
      },
      {
        slots: {
          toolbar: (p: ToolbarSlotProps) => {
            toolbar = p
            return h('span')
          }
        }
      }
    )
    await flush()
    expect(m.events).toEqual([])
    expect(toolbar!.canClearFilters).toBe(true)
    toolbar!.clearFilters()
    await flush()
    expect(m.events).toEqual([
      [makeQuery({ sort: { field: 'age', direction: 'asc' } }), 'reset']
    ])
  })

  it('draws pinned columns unpinned, in the order of columns', () => {
    const columns = makeColumns().map(column =>
      column.field === 'age'
        ? { ...column, pinned: 'left' as const }
        : column.field === 'id'
          ? { ...column, pinned: 'right' as const }
          : column
    )
    // With the header they are pinned: left first, right last.
    const pinned = mountIt({ columns, hasSubtable: true })
    expect(fieldsOfFirstRow(pinned)).toEqual(['age', 'name', 'joined', 'id'])
    expect(pinned.wrapper.find('td[data-pinned]').exists()).toBe(true)
    pinned.wrapper.unmount()

    const m = mountIt({ header: false, columns, hasSubtable: true })
    expect(fieldsOfFirstRow(m)).toEqual(['id', 'name', 'age', 'joined'])
    expect(m.wrapper.find('[data-pinned]').exists()).toBe(false)
    expect(m.wrapper.html()).not.toContain('--qt-pin-')
    // The consumer's columns are not written to.
    expect(columns[2].pinned).toBe('left')
  })

  it('carries column widths in a col, one per utility and visible column', () => {
    const columns = makeColumns().map(column =>
      column.field === 'name'
        ? { ...column, width: '240px' }
        : column.field === 'joined'
          ? { ...column, hide: true }
          : column
    )
    const m = mountIt({
      header: false,
      columns,
      hasRightPanel: true,
      hasSubtable: true
    })
    const cols = m.wrapper.findAll('table.qt-table > colgroup > col')
    expect(cols.map(col => col.attributes('style') ?? null)).toEqual([
      null,
      null,
      null,
      'width: 240px;',
      null
    ])
  })

  it('ignores scrollBody and autoWidth: one table, no width drawn', () => {
    const m = mountIt({ header: false, scrollBody: true, autoWidth: true })
    expect(m.wrapper.findAll('table')).toHaveLength(1)
    expect(m.wrapper.find('.qt-table-head').exists()).toBe(false)
    expect(m.wrapper.find('.qt-table-responsive').attributes('role')).toBe(
      undefined
    )
    expect(m.wrapper.find('col[style]').exists()).toBe(false)
  })

  it('without it, or with true, draws the header of 3.18 and no colgroup', () => {
    for (const props of [{}, { header: true }]) {
      const m = mountIt({ filterable: true, ...props })
      expect(m.wrapper.find('thead').exists()).toBe(true)
      expect(m.wrapper.find('.qt-filter-input').exists()).toBe(true)
      expect(m.wrapper.find('colgroup').exists()).toBe(false)
      m.wrapper.unmount()
      mounted = null
    }
  })
})
