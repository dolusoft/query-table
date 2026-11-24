import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'

import QueryTable, { type RowSelection } from '@dolusoft/query-table'

import { makeQuery } from '../../support/fixtures'
import {
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  useFixedLayout,
  type HostApi,
  type ScrollRow
} from '../../support/scroll-host'

// C-130 in a real browser: a row that cannot be selected in a virtual body,
// a pinned one included, the header checkbox over rows that are not drawn,
// and the keyboard. Not compared with a 3.20 baseline (`ADDED_AFTER_BASELINE`).

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(() => {
  cleanup()
  window.scrollTo(0, 0)
})

const drawnRows = () => [
  ...document.querySelectorAll<HTMLElement>(
    '.qt-table tbody > tr[data-row-index]'
  )
]
const boxOf = (tr: Element) =>
  tr.querySelector<HTMLInputElement>('.qt-select-row')!

test('C-130 a virtual body disables the checkbox of a row that cannot be selected, a pinned one included [tanstack] [own]', async () => {
  const emitted: RowSelection[] = []
  let api: HostApi | null = null
  await render(ScrollHost as never, {
    props: {
      rows: scrollRows(1000),
      tableProps: {
        virtual: true,
        selection: {},
        'onUpdate:selection': (next: RowSelection) => emitted.push(next),
        rowPinning: { top: ['3'], bottom: [] },
        rowSelectable: (row: ScrollRow) => row.id % 2 === 0
      },
      height: 300,
      slots: {},
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(4)
  const check = () => {
    const rows = drawnRows()
    expect(rows.length).toBeGreaterThan(0)
    for (const tr of rows) {
      const id = Number(tr.dataset.rowIndex) + 1
      expect(boxOf(tr).disabled).toBe(id % 2 === 1)
    }
  }
  const pinned = drawnRows()[0]
  expect(pinned.dataset.pinnedRow).toBe('top')
  expect(boxOf(pinned).disabled).toBe(true)
  check()
  await scrollTo(api!.box(), 32 * 300)
  check()

  // The header checkbox selects every row given that can be selected, drawn
  // or not.
  await userEvent.click(
    document.querySelector<HTMLInputElement>('.qt-select-all')!
  )
  expect(emitted).toHaveLength(1)
  const keys = Object.keys(emitted[0])
  expect(keys).toHaveLength(500)
  expect(keys.every(key => Number(key) % 2 === 0)).toBe(true)
})

test('C-130 Tab skips the disabled checkbox of a row that cannot be selected [own]', async () => {
  await render(QueryTable as never, {
    props: {
      columns: [{ field: 'name', title: 'Name' }],
      rows: [
        { id: 1, name: 'alice' },
        { id: 2, name: 'locked' },
        { id: 3, name: 'bob' }
      ],
      totalRows: 3,
      query: makeQuery(),
      rowKey: 'id',
      selection: {},
      rowSelectable: (row: { id: number }) => row.id !== 2
    } as never
  })
  await frames(1)
  const boxes = [
    ...document.querySelectorAll<HTMLInputElement>('.qt-select-row')
  ]
  expect(boxes.map(box => box.disabled)).toEqual([false, true, false])
  boxes[0].focus()
  await userEvent.keyboard('{Tab}')
  expect(document.activeElement).toBe(boxes[2])
})
