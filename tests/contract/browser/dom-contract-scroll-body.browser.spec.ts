import { afterAll, beforeAll, test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { h } from 'vue'

import { createCollector } from '../../support/dom-collector'
import {
  frames,
  ScrollHost,
  scrollRows,
  scrollTo
} from '../../support/scroll-host'

// C-102: with `scrollBody` (and `virtual`, for `aria-rowcount`) the table
// renders the hooks the DOM contract marks `addedBy` C-101 and C-102, each
// on its element, and nothing outside the contract. Not compared with a
// 3.7.0 baseline (`ADDED_AFTER_BASELINE`); C-40 covers the table with it off.

let style: HTMLStyleElement
beforeAll(() => {
  style = document.createElement('style')
  style.textContent = [
    '.qt-table-body { height: 300px; overflow-x: auto; overflow-y: scroll; }',
    '.qt-table-head, .qt-table-foot { overflow-x: hidden; overflow-y: scroll; }',
    '.qt-table.qt-table { table-layout: fixed; }'
  ].join(' ')
  document.head.append(style)
})
afterAll(() => style.remove())

test('C-102 the DOM with `scrollBody` matches the DOM contract', async () => {
  const dom = createCollector()
  await render(ScrollHost as never, {
    props: {
      rows: scrollRows(500),
      pageSize: 500,
      height: 0,
      tableProps: {
        scrollBody: true,
        virtual: true,
        hasSubtable: true,
        footerRows: [{ cells: [{ field: 'age', text: 'Total' }] }]
      },
      slots: { subtable: () => h('span', 'details') },
      api: () => {}
    } as never
  })
  await frames(4)
  await scrollTo(document.querySelector<HTMLElement>('.qt-table-body'), 6000)
  document
    .querySelector<HTMLButtonElement>('.qt-table-body .qt-expand')!
    .click()
  await frames(4)
  dom.collect()
  cleanup()

  dom.expectNothingOutsideContract()
  const added = (entry: { addedBy?: string }) =>
    entry.addedBy === 'C-101' || entry.addedBy === 'C-102'
  dom.expectEntriesRendered(added)
  dom.expectInlineStyles(added)
})
