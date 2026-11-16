import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'

import {
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  useFixedLayout,
  type HostApi
} from '../../support/scroll-host'

// C-121 in a real browser, with the test skin: a virtual body without a
// header counts no header row and aligns to the top of the view.

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(() => {
  cleanup()
  window.scrollTo(0, 0)
})

const mount = async (tableProps: Record<string, unknown> = {}) => {
  let api: HostApi | null = null
  await render(ScrollHost as never, {
    props: {
      rows: scrollRows(200),
      tableProps: { virtual: true, header: false, ...tableProps },
      height: 300,
      totalRows: null,
      slots: {},
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(4)
  return api!
}

const row = (index: number) =>
  document.querySelector<HTMLElement>(
    `.qt-table tbody > tr[data-row-index="${index}"]`
  )

describe('C-121 A table without a header', () => {
  test('counts no header row: the first body row is 1', async () => {
    const api = await mount({
      footerRows: [{ cells: [{ field: 'age', text: 'Total' }] }]
    })
    expect(document.querySelector('.qt-table thead')).toBeNull()
    const table = document.querySelector('.qt-table')!
    // 200 rows + 1 footer row.
    expect(table.getAttribute('aria-rowcount')).toBe('201')
    expect(row(0)!.getAttribute('aria-rowindex')).toBe('1')
    await scrollTo(api.box(), 3000)
    for (const tr of document.querySelectorAll<HTMLElement>(
      '.qt-table tbody > tr[data-row-index]'
    )) {
      expect(tr.getAttribute('aria-rowindex')).toBe(
        String(Number(tr.dataset.rowIndex) + 1)
      )
    }
    expect(
      document
        .querySelector('.qt-table tfoot > tr')!
        .getAttribute('aria-rowindex')
    ).toBe('201')
  })

  test.each(['start', 'end'] as const)(
    'scrollToIndex with align %s lines the row up with the edge of the view',
    async align => {
      const api = await mount()
      const box = api.box()
      api.table().scrollToIndex(120, { align })
      await frames(8)
      const rect = row(120)!.getBoundingClientRect()
      const view = box.getBoundingClientRect()
      if (align === 'start') {
        expect(rect.top).toBeCloseTo(view.top, -1)
      } else {
        expect(rect.bottom).toBeCloseTo(view.top + box.clientHeight, -1)
      }
    }
  )
})
