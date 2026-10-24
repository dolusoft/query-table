import { test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'

import QueryTable from '@dolusoft/query-table'

import { createCollector } from '../../support/dom-collector'
import { makeQuery, rows } from '../../support/fixtures'

// C-116: a number filter input holding text that gives no rule renders the
// hook the DOM contract marks `addedBy` C-116, and nothing outside the
// contract. Not compared with a 3.0.0 baseline (`ADDED_AFTER_BASELINE`).

test('C-116 the DOM with text that gives no rule matches the DOM contract', async () => {
  const dom = createCollector()
  await render(QueryTable as never, {
    props: {
      columns: [
        { field: 'name', title: 'Name' },
        { field: 'age', title: 'Age', type: 'number' }
      ],
      rows: rows(3),
      totalRows: 3,
      query: makeQuery(),
      filterable: true
    } as never
  })
  const age = document.querySelector<HTMLInputElement>(
    'th[data-field="age"] input.qt-filter-input'
  )!
  await userEvent.fill(age, '80,abc')
  dom.collect()
  cleanup()

  dom.expectNothingOutsideContract()
  dom.expectEntriesRendered(entry => entry.addedBy === 'C-116')
})
