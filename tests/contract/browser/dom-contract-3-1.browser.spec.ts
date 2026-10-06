import { test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'

import QueryTable from '@dolusoft/query-table'

import { createCollector } from '../../support/dom-collector'
import { makeQuery, rows } from '../../support/fixtures'

// C-72: with the 3.1 features on, the table renders the hooks the DOM
// contract marks `addedBy` C-71 and C-73 (C-74 comes with row pinning), each
// on its element, and nothing outside the contract. Not compared with a
// 3.0.0 baseline (`ADDED_AFTER_BASELINE`); C-40 covers the table with them
// off.

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

  // C-73: reorder handles, collected in the middle of a drag (the preview).
  await render(QueryTable as never, {
    props: {
      columns: [
        { field: 'id', title: 'ID', type: 'number' },
        { field: 'name', title: 'Name' },
        { field: 'age', title: 'Age', type: 'number' }
      ],
      rows: rows(3),
      totalRows: 3,
      query: makeQuery(),
      reorderable: true
    } as never
  })
  const handle = document.querySelector(
    'th[data-field="id"] > .qt-reorder-handle'
  )!
  const target = document
    .querySelector('th[data-field="age"]')!
    .getBoundingClientRect()
  const pointer = (clientX: number, clientY: number) => ({
    bubbles: true,
    clientX,
    clientY,
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    buttons: 1
  })
  const start = handle.getBoundingClientRect()
  handle.dispatchEvent(
    new PointerEvent('pointerdown', pointer(start.left + 2, start.top + 2))
  )
  handle.dispatchEvent(
    new PointerEvent(
      'pointermove',
      pointer(target.right - 4, target.top + target.height / 2)
    )
  )
  await frames()
  dom.collect()
  handle.dispatchEvent(new PointerEvent('pointercancel', pointer(0, 0)))
  cleanup()

  dom.expectNothingOutsideContract()
  const added = (entry: { addedBy?: string }) =>
    entry.addedBy === 'C-71' || entry.addedBy === 'C-73'
  dom.expectEntriesRendered(added)
  dom.expectInlineStyles(added)
})
