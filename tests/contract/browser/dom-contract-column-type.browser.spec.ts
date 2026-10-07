import { expect, test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'

import QueryTable from '@dolusoft/query-table'

import { createCollector } from '../../support/dom-collector'
import { makeQuery } from '../../support/fixtures'

// C-82: every cell of a column carries `data-type`, the entry the DOM
// contract marks `addedBy: 'C-82'`, and nothing outside the contract. Not
// compared with a 3.1 baseline (`ADDED_AFTER_BASELINE`); C-40 covers the
// rest of the list.

test('C-82 the column type is on every cell of a column, as the DOM contract lists it [own]', async () => {
  const dom = createCollector()
  await render(QueryTable as never, {
    props: {
      columns: [
        { field: 'name', title: 'Name' },
        { field: 'price', title: 'Price', type: 'number', pinned: 'left' },
        { field: 'count', title: 'Count', type: 'Integer' },
        { field: 'active', title: 'Active', type: 'bool' },
        { field: 'day', title: 'Day', type: 'date' },
        { field: 'at', title: 'At', type: 'datetime', pinned: 'right' }
      ],
      rows: [
        {
          id: 1,
          name: 'alice',
          price: 1.5,
          count: 3,
          active: true,
          day: '2024-01-10',
          at: '2024-01-10T08:00:00Z'
        }
      ],
      totalRows: 1,
      query: makeQuery(),
      rowKey: 'id',
      selection: {},
      hasSubtable: true,
      hasRightPanel: true,
      footerRows: [{ cells: [{ field: 'price', text: 'Sum' }] }]
    } as never
  })
  await new Promise(resolve => requestAnimationFrame(resolve))
  dom.collect()

  const types = (selector: string) =>
    [...document.querySelectorAll(`${selector}[data-field]`)].map(cell =>
      cell.getAttribute('data-type')
    )
  // Pinned left first, pinned right last (C-46, C-71).
  const want = ['number', 'string', 'integer', 'bool', 'date', 'datetime']
  expect(types('thead th')).toEqual(want)
  expect(types('tbody tr[data-row-index] > td')).toEqual(want)
  expect(types('.qt-footer td')).toEqual(want)
  // Utility cells carry none.
  expect(
    [...document.querySelectorAll('.qt-datatable [data-type]')].every(cell =>
      cell.hasAttribute('data-field')
    )
  ).toBe(true)
  cleanup()

  dom.expectNothingOutsideContract()
  dom.expectEntriesRendered(entry => entry.addedBy === 'C-82')
})
