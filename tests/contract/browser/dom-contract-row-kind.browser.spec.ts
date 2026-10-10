import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'

import QueryTable from '@dolusoft/query-table'

import { createCollector } from '../../support/dom-collector'
import { makeQuery } from '../../support/fixtures'
import {
  drawnIndexes,
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  useFixedLayout,
  type HostApi,
  type ScrollRow
} from '../../support/scroll-host'

// C-97 and C-98 in a real browser: `data-row-kind`, the entry the DOM
// contract marks `addedBy: 'C-97'`, and rows that cannot expand, on pinned
// rows and in a virtual body. Not compared with a 3.4 baseline
// (`ADDED_AFTER_BASELINE`).

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(() => {
  cleanup()
  window.scrollTo(0, 0)
})

test('C-97 the row kind is on its row, as the DOM contract lists it [own]', async () => {
  const dom = createCollector()
  await render(QueryTable as never, {
    props: {
      columns: [
        { field: 'name', title: 'Name' },
        { field: 'count', title: 'Count', type: 'number' }
      ],
      rows: [
        { id: 1, name: 'alice', count: 3 },
        { id: 2, name: 'bob', count: 2 },
        { id: 3, name: 'Others', count: 9 }
      ],
      totalRows: 3,
      query: makeQuery(),
      rowKey: 'id',
      hasSubtable: true,
      rowPinning: { top: ['2'], bottom: [] },
      rowKind: (row: { id: number }) =>
        row.id === 3 ? 'others' : row.id === 2 ? 'pinned' : null,
      rowExpandable: (row: { id: number }) => row.id !== 3
    } as never
  })
  await frames(1)
  dom.collect()

  const drawn = [
    ...document.querySelectorAll<HTMLElement>('tbody > tr[data-row-index]')
  ].map(tr => [tr.dataset.rowIndex, tr.dataset.rowKind ?? null])
  // The pinned row first (C-74), with its kind.
  expect(drawn).toEqual([
    ['1', 'pinned'],
    ['0', null],
    ['2', 'others']
  ])
  const others = document.querySelector('tr[data-row-kind="others"]')!
  expect(others.querySelector('.qt-expand')).toBeNull()
  cleanup()

  dom.expectNothingOutsideContract()
  dom.expectEntriesRendered(entry => entry.addedBy === 'C-97')
})

const mountScroll = async (tableProps: Record<string, unknown>) => {
  let api: HostApi | null = null
  await render(ScrollHost as never, {
    props: {
      rows: scrollRows(1000),
      tableProps: { virtual: true, ...tableProps },
      height: 300,
      slots: {},
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(4)
  return api!
}

const drawnRows = () => [
  ...document.querySelectorAll<HTMLElement>(
    '.qt-table tbody > tr[data-row-index]'
  )
]

test('C-97 a virtual body writes the kind on the rows it draws, a pinned row included [own]', async () => {
  const api = await mountScroll({
    rowPinning: { top: ['900'], bottom: [] },
    rowKind: (row: ScrollRow, index: number) =>
      row.id % 100 === 0 ? `hundred-${index}` : undefined
  })
  const check = () => {
    const rows = drawnRows()
    expect(rows.length).toBeGreaterThan(0)
    for (const tr of rows) {
      const index = Number(tr.dataset.rowIndex)
      const want = (index + 1) % 100 === 0 ? `hundred-${index}` : undefined
      expect(tr.dataset.rowKind).toBe(want)
    }
  }
  // The pinned row (id 900, index 899) is drawn first.
  expect(drawnRows()[0].dataset.pinnedRow).toBe('top')
  expect(drawnRows()[0].dataset.rowKind).toBe('hundred-899')
  check()
  api.table().scrollToIndex(499, { align: 'center' })
  await frames(4)
  expect(drawnIndexes()).toContain(499)
  expect(document.querySelector('tr[data-row-index="499"]')).toBeTruthy()
  expect(
    document
      .querySelector('tr[data-row-index="499"]')!
      .getAttribute('data-row-kind')
  ).toBe('hundred-499')
  check()
})

test('C-98 a virtual body draws no expand button on a row that cannot expand, a pinned one included [tanstack] [own]', async () => {
  const api = await mountScroll({
    hasSubtable: true,
    rowPinning: { top: ['3'], bottom: [] },
    rowExpandable: (row: ScrollRow) => row.id % 2 === 0
  })
  const check = () => {
    for (const tr of drawnRows()) {
      const id = Number(tr.dataset.rowIndex) + 1
      expect(!!tr.querySelector('.qt-expand')).toBe(id % 2 === 0)
    }
  }
  const pinned = drawnRows()[0]
  expect(pinned.dataset.pinnedRow).toBe('top')
  expect(pinned.dataset.rowIndex).toBe('2')
  expect(pinned.querySelector('.qt-expand')).toBeNull()
  check()
  await scrollTo(api.box(), 32 * 300)
  check()
  const open = drawnRows().find(tr => tr.querySelector('.qt-expand'))!
  open.querySelector<HTMLButtonElement>('.qt-expand')!.click()
  await frames(2)
  expect(open.dataset.expanded).toBe('')
  expect(open.nextElementSibling?.classList.contains('qt-subtable-row')).toBe(
    true
  )
  expect(document.querySelectorAll('tr[data-expanded]')).toHaveLength(1)
})
