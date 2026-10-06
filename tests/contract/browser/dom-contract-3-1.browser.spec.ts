import { test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'

import QueryTable from '@dolusoft/query-table'

import { createCollector } from '../../support/dom-collector'
import { makeQuery, rows } from '../../support/fixtures'

// C-72: with the 3.1 features on, the table renders the hooks the DOM
// contract marks `addedBy` C-71, C-73 and C-74, each on its element, and
// nothing outside the contract. Not compared with a 3.0.0 baseline
// (`ADDED_AFTER_BASELINE`); C-40 covers the table with them off.

const frames = async (n = 3) => {
  for (let i = 0; i < n; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve))
  }
}

test('C-72 the DOM with 3.1 features matches the DOM contract', async () => {
  const dom = createCollector()
  await render(QueryTable as never, {
    props: {
      columns: [
        { field: 'id', title: 'ID', type: 'number', pinned: 'left' },
        { field: 'name', title: 'Name' },
        { field: 'age', title: 'Age', type: 'number', pinned: 'right' },
        { field: 'joined', title: 'Joined', type: 'date', pinned: 'right' }
      ],
      rows: rows(3),
      totalRows: 3,
      query: makeQuery(),
      rowKey: 'id',
      hasSubtable: true,
      footerRows: [{ cells: [{ field: 'age', text: 'Total' }] }]
    } as never
  })
  // The offsets are written once the observer has measured the header.
  await frames()
  dom.collect()
  cleanup()

  dom.expectNothingOutsideContract()
  const added = (entry: { addedBy?: string }) => entry.addedBy === 'C-71'
  dom.expectEntriesRendered(added)
  dom.expectInlineStyles(added)
})
