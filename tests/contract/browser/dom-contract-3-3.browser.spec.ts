import { afterAll, beforeAll, expect, test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'

import { createCollector } from '../../support/dom-collector'
import {
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  useFixedLayout,
  type HostApi
} from '../../support/scroll-host'

// C-95: with `flash` on, the table renders the hooks the DOM contract marks
// `addedBy` C-94, each on its element, and nothing outside the contract:
// `data-flash` on a new row and on a changed cell, and
// `--qt-flash-elapsed` on a row bound after its flash began (it came back
// into the window of a virtual body). Not compared with a 3.2 baseline
// (`ADDED_AFTER_BASELINE`); with `flash` off, C-40, C-72 and C-91 cover the
// table.

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

test('C-95 the DOM with the change flash matches the DOM contract', async () => {
  const dom = createCollector()
  let api: HostApi | null = null
  const rows = scrollRows(300)
  await render(ScrollHost as never, {
    props: {
      rows,
      tableProps: {
        flash: true,
        virtual: { rowHeight: 37 },
        hasSubtable: true,
        columns: [
          { field: 'id', title: 'ID', type: 'number', pinned: 'left' },
          { field: 'name', title: 'Name' },
          { field: 'age', title: 'Age', type: 'number' }
        ]
      },
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(2)
  // A changed cell and a new row at the top.
  api!.setRows([
    { id: 1000, name: 'New', age: 30 },
    ...rows.map(row => (row.id === 2 ? { ...row, age: 99 } : row))
  ])
  await frames(2)
  // Out of the window and back: bound again, with the time gone.
  await scrollTo(api!.box(), 5000)
  await sleep(150)
  await scrollTo(api!.box(), 0)
  const top = document.querySelector<HTMLElement>(
    '.qt-table tbody > tr[data-row-index="0"]'
  )!
  expect(top.dataset.flash).toBeDefined()
  expect(top.style.getPropertyValue('--qt-flash-elapsed')).not.toBe('')
  dom.collect()
  cleanup()

  dom.expectNothingOutsideContract()
  const added = (entry: { addedBy?: string }) => entry.addedBy === 'C-94'
  dom.expectEntriesRendered(added)
  dom.expectInlineStyles(added)
})
