import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { h, nextTick } from 'vue'

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

// C-119: `virtual.keepAnchor` keeps the first row wholly in view where it is
// when rows come in above it. 3.18 addition: not in a 3.17 baseline
// (`ADDED_AFTER_BASELINE`).

let restoreLayout: () => void
// Chromium's own scroll anchoring follows a moved row node and would keep
// some rows in place by itself; Safari has none. Off, the tests see only
// what the table does.
const noBrowserAnchoring = document.createElement('style')
noBrowserAnchoring.textContent = '.scroll-box { overflow-anchor: none; }'
beforeAll(() => {
  restoreLayout = useFixedLayout()
  document.head.append(noBrowserAnchoring)
})
afterAll(() => {
  restoreLayout()
  noBrowserAnchoring.remove()
})
afterEach(() => {
  cleanup()
  window.scrollTo(0, 0)
})

const mount = async (
  options: {
    rows?: ScrollRow[]
    tableProps?: Record<string, unknown>
    slots?: Record<string, unknown>
  } = {}
) => {
  let api: HostApi | null = null
  const rows = options.rows ?? scrollRows(1000)
  await render(ScrollHost as never, {
    props: {
      rows,
      tableProps: { virtual: { keepAnchor: true }, ...options.tableProps },
      height: 300,
      slots: options.slots ?? {},
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(4)
  return { api: api!, rows }
}

/** The first data row whose top is in the box, below the sticky header. */
const firstWhole = (box: HTMLElement) => {
  const top = box.getBoundingClientRect().top
  const head = document
    .querySelector('.qt-table thead')!
    .getBoundingClientRect()
  const edge = head.top <= top + 1 && head.bottom > top ? head.bottom : top
  const tr = [
    ...document.querySelectorAll<HTMLElement>(
      '.qt-table tbody > tr[data-row-index]'
    )
  ].find(row => row.getBoundingClientRect().top >= edge - 0.5)!
  return { tr, top: tr.getBoundingClientRect().top }
}

/** The drawn row that shows the row with this `id`. */
const rowOf = (id: number) =>
  [
    ...document.querySelectorAll<HTMLElement>(
      '.qt-table tbody > tr[data-row-index]'
    )
  ].find(tr => tr.querySelector('td')?.textContent?.trim() === String(id))

/** The `id` of the row a drawn row shows. */
const idOf = (tr: HTMLElement) =>
  Number(tr.querySelector('td')!.textContent.trim())

const tall = {
  'cell-name': (p: { rowIndex: number; row: ScrollRow }) =>
    h('div', { style: p.row.id % 10 === 0 ? 'height: 120px' : '' }, p.row.name)
}

describe('C-119 Keeping the anchor [own]', () => {
  test('rows added above the view leave the rows in view where they were', async () => {
    const { api, rows } = await mount()
    await scrollTo(api.box(), 3000)
    const { tr, top } = firstWhole(api.box())
    const id = idOf(tr)
    const index = Number(tr.dataset.rowIndex)
    api.setRows([...scrollRows(5, 5000), ...rows])
    await frames(6)
    const after = rowOf(id)!
    // The row moved down by five in `rows` and stays at the same place.
    expect(Number(after.dataset.rowIndex)).toBe(index + 5)
    expect(after.getBoundingClientRect().top).toBeCloseTo(top, 0)
    expect(firstWhole(api.box()).tr).toBe(after)
    expect(api.events).toEqual([])
  })

  test('rows removed above the view leave the rows in view where they were', async () => {
    const { api, rows } = await mount()
    await scrollTo(api.box(), 3000)
    const { tr, top } = firstWhole(api.box())
    const id = idOf(tr)
    api.setRows(rows.slice(7))
    await frames(6)
    expect(rowOf(id)!.getBoundingClientRect().top).toBeCloseTo(top, 0)
  })

  test('at the top the new rows are shown', async () => {
    const { api, rows } = await mount()
    api.setRows([...scrollRows(3, 5000), ...rows])
    await frames(6)
    expect(api.box().scrollTop).toBe(0)
    expect(drawnIndexes()[0]).toBe(0)
    expect(idOf(firstWhole(api.box()).tr)).toBe(5001)
  })

  test('an anchor that is not drawn at its new place is scrolled to and corrected', async () => {
    // Many rows of unmeasured, uneven heights come in above: the anchor's
    // new place lies far past the drawn window.
    const { api, rows } = await mount({
      tableProps: {
        virtual: { keepAnchor: true, overscan: 2, estimateRowHeight: 20 }
      },
      slots: tall
    })
    await scrollTo(api.box(), 3000)
    const { tr, top } = firstWhole(api.box())
    const id = idOf(tr)
    api.setRows([...scrollRows(300, 5000), ...rows])
    await frames(10)
    const after = rowOf(id)!
    expect(after).toBeDefined()
    expect(after.getBoundingClientRect().top).toBeCloseTo(top, 0)
    expect(api.events).toEqual([])
  })

  test('off by default: rows added above move the rows in view', async () => {
    const { api, rows } = await mount({
      tableProps: { virtual: { rowHeight: 40 } }
    })
    await scrollTo(api.box(), 3000)
    const { tr } = firstWhole(api.box())
    const id = idOf(tr)
    api.setRows([...scrollRows(5, 5000), ...rows])
    await frames(6)
    expect(idOf(firstWhole(api.box()).tr)).not.toBe(id)
  })

  test('without rowKey nothing is kept', async () => {
    const { api, rows } = await mount({
      tableProps: {
        virtual: { keepAnchor: true, rowHeight: 40 },
        rowKey: undefined
      }
    })
    await scrollTo(api.box(), 3000)
    const scrollTop = api.box().scrollTop
    api.setRows([...scrollRows(5, 5000), ...rows])
    await frames(6)
    expect(api.box().scrollTop).toBe(scrollTop)
  })

  test('a scrollToIndex called after the change wins', async () => {
    const { api, rows } = await mount({
      tableProps: { virtual: { keepAnchor: true, rowHeight: 40 } }
    })
    await scrollTo(api.box(), 3000)
    api.setRows([...scrollRows(5, 5000), ...rows])
    await nextTick()
    api.table().scrollToIndex(500, { align: 'start' })
    await frames(6)
    // Row 500 of the new rows is at the top of the box, not the anchor.
    expect(rowOf(rows[495].id)!.getBoundingClientRect().top).toBeCloseTo(
      api.box().getBoundingClientRect().top,
      -1
    )
  })
})
