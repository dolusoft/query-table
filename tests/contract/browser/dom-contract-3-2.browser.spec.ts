import { afterAll, beforeAll, test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { h } from 'vue'

import { createCollector } from '../../support/dom-collector'
import {
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  useFixedLayout,
  type HostApi
} from '../../support/scroll-host'

// C-91: with `virtual` and `infinite` on, the table renders the hooks the
// DOM contract marks `addedBy` C-83, C-86 and C-89, each on its element, and
// nothing outside the contract. Not compared with a 3.1.0 baseline
// (`ADDED_AFTER_BASELINE`); C-40 and C-72 cover the table with them off.

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())

test('C-91 the DOM with 3.2 features matches the DOM contract', async () => {
  const dom = createCollector()
  let api: HostApi | null = null
  await render(ScrollHost as never, {
    props: {
      rows: scrollRows(500),
      pageSize: 50,
      totalRows: null,
      tableProps: {
        virtual: true,
        infinite: { threshold: 2 },
        hasSubtable: true,
        footerRows: [{ cells: [{ field: 'age', text: 'Total' }] }]
      },
      slots: {
        subtable: () => h('span', 'details'),
        'load-more': () => h('span', 'more')
      },
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(4)
  // Both spacers: the window is in the middle of the rows.
  await scrollTo(api!.box(), 6000)
  document
    .querySelector<HTMLButtonElement>('.qt-table tbody .qt-expand')!
    .click()
  await frames(4)
  dom.collect()
  cleanup()

  dom.expectNothingOutsideContract()
  const added = (entry: { addedBy?: string }) =>
    entry.addedBy === 'C-83' ||
    entry.addedBy === 'C-86' ||
    entry.addedBy === 'C-89'
  dom.expectEntriesRendered(added)
  dom.expectInlineStyles(added)
})
