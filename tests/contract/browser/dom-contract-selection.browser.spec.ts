import { test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'

import QueryTable from '@dolusoft/query-table'

import { createCollector } from '../../support/dom-collector'
import { columns, makeQuery, rows } from '../../support/fixtures'

// C-66: with a `selection` prop the table renders the hooks the DOM contract
// marks `addedBy: 'C-64'`, each on its element, and nothing outside the
// contract. 2.2.x has no selection column, so this test is not compared with
// the baseline (`ADDED_AFTER_BASELINE`); C-40 covers the rest of the list.

test('C-66 the DOM with a selection matches the DOM contract', async () => {
  const dom = createCollector()
  await render(QueryTable as never, {
    props: {
      columns: columns(),
      rows: rows(3),
      totalRows: 3,
      query: makeQuery(),
      rowKey: 'id',
      selection: { '1': true }
    } as never
  })
  dom.collect()
  cleanup()

  dom.expectNothingOutsideContract()
  dom.expectEntriesRendered(entry => entry.addedBy === 'C-64')
})
