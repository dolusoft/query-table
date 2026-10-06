import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import { h } from 'vue'

import type { FilterMenuSlotProps, TableQuery } from '@dolusoft/query-table'
import QueryTable from '@dolusoft/query-table'

import { createCollector } from '../../support/dom-collector'
import { columns, makeQuery, rows, rule } from '../../support/fixtures'

// C-40: the table renders exactly the classes and attributes of the DOM
// contract, and every entry of the contract shows up in some state. The table
// is rendered bare: its own output only, no consumer styling or slot widgets
// beyond the trigger it hands out. Hooks that only v3 adds (the selection
// column, C-64) carry `addedBy` in the contract and are checked by C-66; this
// test runs without `selection`, so it holds for the 2.2.x baseline too.

const slots = {
  'filter-menu': (menu: FilterMenuSlotProps) => h(menu.trigger),
  empty: () => h('span', 'nothing'),
  loading: () => h('span', 'loading'),
  subtable: () => h('b', 'detail'),
  pagination: () => h('span', 'pages')
}

const renderTable = (props: Record<string, unknown>) =>
  render(QueryTable as never, {
    props: {
      columns: [
        ...columns(),
        { field: 'active', title: 'Active', type: 'bool' }
      ],
      rows: rows(3),
      totalRows: 3,
      query: makeQuery(),
      sortable: true,
      filterable: true,
      ...props
    } as never,
    slots: slots
  })

const filtered: TableQuery = makeQuery({
  sort: { field: 'age', direction: 'desc' },
  filters: [rule('name', 'Contains', 'Name')]
})

const dom = createCollector()

test('C-40 the rendered DOM matches the DOM contract in every state', async () => {
  // A full table: sorted, filtered, with both utility columns, a footer, an
  // expanded row and a column that defines a width.
  await renderTable({
    hasSubtable: true,
    hasRightPanel: true,
    query: filtered,
    rowKey: 'id',
    resizable: true,
    columns: [
      { field: 'id', title: 'ID', type: 'number', width: '80px' },
      { field: 'name', title: 'Name', pinned: 'left' },
      { field: 'age', title: 'Age', type: 'number' },
      { field: 'joined', title: 'Joined', type: 'date' },
      { field: 'active', title: 'Active', type: 'bool', sortable: false }
    ],
    footerRows: [{ cells: [{ field: 'id', text: 'Total' }] }]
  })
  await userEvent.click(document.querySelector('.qt-expand')!)
  // The pin offsets are measured after layout.
  await new Promise(resolve => requestAnimationFrame(resolve))
  await new Promise(resolve => requestAnimationFrame(resolve))
  dom.collect()
  cleanup()

  await renderTable({ rows: [], totalRows: 0 })
  await expect
    .element(document.querySelector<HTMLElement>('.qt-empty-row'))
    .toBeInTheDocument()
  dom.collect()
  cleanup()

  // Loading over the rows (C-52).
  await renderTable({ loading: true, hasSubtable: true })
  await expect
    .element(document.querySelector<HTMLElement>('.qt-loading-row'))
    .toBeInTheDocument()
  dom.collect()
  cleanup()

  dom.expectNothingOutsideContract()
  // Every entry of the contract the 2.2.x table renders is rendered by some
  // state; the ones C-66 covers are left to it.
  dom.expectEntriesRendered(entry => entry.addedBy === undefined)
  dom.expectInlineStyles()
})
