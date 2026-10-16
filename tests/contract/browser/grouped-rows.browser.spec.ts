import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { h } from 'vue'

import QueryTable from '@dolusoft/query-table'

import { createCollector } from '../../support/dom-collector'
import { makeQuery } from '../../support/fixtures'
import {
  drawnIndexes,
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  spacers,
  useFixedLayout,
  type HostApi,
  type ScrollRow
} from '../../support/scroll-host'

// C-101 to C-103 in a real browser: the group rows of `groupBy`, in a plain
// body and in a virtual one, the sticky group row a virtual body keeps
// drawn, and the DOM contract entry `addedBy: 'C-101'`. Not compared with a
// 3.7 baseline (`ADDED_AFTER_BASELINE`).

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(() => {
  cleanup()
  window.scrollTo(0, 0)
})

interface Item {
  id: number
  name: string
  kind: string | null
}

const columns = [
  { field: 'id', title: 'ID', type: 'number' },
  { field: 'name', title: 'Name' }
]

const items = (kinds: Array<string | null>): Item[] =>
  kinds.map((kind, i) => ({ id: i + 1, name: `Item ${i + 1}`, kind }))

const groupRows = () => [
  ...document.querySelectorAll<HTMLElement>('.qt-table tbody > tr.qt-group-row')
]

/** The body as `g:<text>` for a group row and the `data-row-index` of a row. */
const bodyShape = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      '.qt-table tbody > tr:not(.qt-virtual-spacer)'
    )
  ].map(tr =>
    tr.classList.contains('qt-group-row')
      ? `g:${tr.textContent.trim()}`
      : (tr.dataset.rowIndex ?? tr.className)
  )

describe('C-101 Grouped rows [own]', () => {
  test('a group row is drawn above each run of one key, and the rows keep their indexes', async () => {
    await render(QueryTable as never, {
      props: {
        columns,
        rows: items(['a', 'a', 'b', null, 'b', 'a']),
        totalRows: 6,
        query: makeQuery(),
        rowKey: 'id',
        groupBy: (row: Item) => row.kind
      } as never
    })
    await frames(1)
    // A key that comes back after another starts a new group; `null` ends one.
    expect(bodyShape()).toEqual([
      'g:a',
      '0',
      '1',
      'g:b',
      '2',
      '3',
      'g:b',
      '4',
      'g:a',
      '5'
    ])
    const [first] = groupRows()
    const cell = first.firstElementChild as HTMLTableCellElement
    expect(first.children).toHaveLength(1)
    expect(cell.tagName).toBe('TH')
    expect(cell.getAttribute('scope')).toBe('row')
    expect(cell.colSpan).toBe(2)
    for (const tr of groupRows()) {
      expect(tr.hasAttribute('data-row-index')).toBe(false)
      expect(tr.hasAttribute('aria-rowindex')).toBe(false)
    }
  })

  test('the group slot receives the key, the count, the first row and its index', async () => {
    const seen: unknown[] = []
    await render(QueryTable as never, {
      props: {
        columns,
        rows: items(['x', 'y', 'y', 'y']),
        totalRows: 4,
        query: makeQuery(),
        rowKey: 'id',
        groupBy: (row: Item) => row.kind,
        selection: {},
        hasSubtable: true,
        rowKind: () => 'kind'
      } as never,
      slots: {
        group: (p: {
          groupKey: string
          count: number
          row: Item
          rowIndex: number
        }) => {
          seen.push({ ...p, row: p.row.id })
          return h(
            'span',
            { class: 'group-label' },
            `${p.groupKey} (${p.count})`
          )
        }
      }
    })
    await frames(1)
    expect(seen).toEqual([
      { groupKey: 'x', count: 1, row: 1, rowIndex: 0 },
      { groupKey: 'y', count: 3, row: 2, rowIndex: 1 }
    ])
    expect(groupRows().map(tr => tr.textContent.trim())).toEqual([
      'x (1)',
      'y (3)'
    ])
    // The group row spans the utility columns too, and has none of a row's
    // marks or controls.
    const [first] = groupRows()
    expect((first.firstElementChild as HTMLTableCellElement).colSpan).toBe(4)
    expect(first.querySelector('input, button')).toBeNull()
    expect(first.hasAttribute('data-row-kind')).toBe(false)
    // The selection's header checkbox still counts the four rows.
    expect(document.querySelectorAll('tbody input.qt-select-row')).toHaveLength(
      4
    )
  })

  test('pinned rows are drawn without a group row', async () => {
    await render(QueryTable as never, {
      props: {
        columns,
        rows: items(['a', 'a', 'b']),
        totalRows: 3,
        query: makeQuery(),
        rowKey: 'id',
        rowPinning: { top: ['3'], bottom: [] },
        groupBy: (row: Item) => row.kind
      } as never
    })
    await frames(1)
    expect(bodyShape()).toEqual(['2', 'g:a', '0', '1'])
  })
})

const STICKY_HEAD = 30
const ROW = 24
const GROUP = 30

const mountScroll = async (
  tableProps: Record<string, unknown>,
  count = 1000,
  slots: Record<string, unknown> = {}
) => {
  let api: HostApi | null = null
  await render(ScrollHost as never, {
    props: {
      rows: scrollRows(count),
      tableProps: {
        virtual: true,
        groupBy: (row: ScrollRow) => `g${Math.floor((row.id - 1) / 125)}`,
        ...tableProps
      },
      height: 300,
      slots,
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(4)
  return api!
}

/**
 * Sticky header and sticky group rows, as a skin would make them. The box
 * scrolls; the test skin's `qt-table-responsive` must not be a scroll
 * container of its own, or nothing sticks to the box.
 */
const useStickySkin = () => {
  const style = document.createElement('style')
  style.textContent = `
    .qt-table-responsive.qt-table-responsive { overflow: visible; }
    .qt-table thead { position: sticky; top: 0; z-index: 2; background: white; }
    .qt-table thead th { height: ${STICKY_HEAD}px; padding: 0; border: 0; box-sizing: border-box; }
    .qt-table tbody > tr.qt-group-row > th { position: sticky; top: ${STICKY_HEAD}px; z-index: 1; background: white; height: ${GROUP}px; }
    .qt-table tbody > tr > :is(td, th) { padding: 0; border: 0; box-sizing: border-box; }
    .qt-table tbody > tr, .qt-table thead > tr { border: 0; }
    .qt-table tbody > tr > td { height: ${ROW}px; }
    .qt-table tr.qt-virtual-spacer > td { height: auto; }
  `
  document.head.append(style)
  return () => style.remove()
}

/** Every drawn row carries a unique, increasing `aria-rowindex`. */
const expectAriaInOrder = () => {
  const indexes = [
    ...document.querySelectorAll<HTMLElement>('.qt-table tr[aria-rowindex]')
  ].map(tr => Number(tr.getAttribute('aria-rowindex')))
  for (let i = 1; i < indexes.length; i++) {
    expect(indexes[i]).toBeGreaterThan(indexes[i - 1])
  }
  return indexes
}

describe('C-102 Grouped rows in a virtual body [own]', () => {
  test('the group row of the top group stays drawn, once, with its own aria index', async () => {
    const restore = useStickySkin()
    try {
      const api = await mountScroll({})
      const table = document.querySelector('.qt-table')!
      // 1 header row, 1000 rows, 8 group rows.
      expect(table.getAttribute('aria-rowcount')).toBe('1009')
      expectAriaInOrder()
      const box = api.box()
      for (const top of [0, 2000, 3100, 7777, 12000, 30000]) {
        await scrollTo(box, top)
        const drawn = drawnIndexes()
        const firstGroup = Math.floor(drawn[0] / 125)
        const groups = groupRows().map(tr => tr.textContent.trim())
        // The group of the first drawn row has its group row, and no group
        // has two.
        expect(groups[0]).toBe(`g${firstGroup}`)
        expect(new Set(groups).size).toBe(groups.length)
        // A group row's index is the one before its group's first row.
        for (const tr of groupRows()) {
          const g = Number(tr.textContent.trim().slice(1))
          const start = g * 125
          expect(Number(tr.getAttribute('aria-rowindex'))).toBe(
            1 + start + g + 1
          )
        }
        expectAriaInOrder()
        // The sticky group row covers the top of the box below the header.
        const stuck = groupRows()[0].firstElementChild!.getBoundingClientRect()
        const view = box.getBoundingClientRect()
        if (top > 0) {
          expect(Math.round(stuck.top - view.top)).toBe(STICKY_HEAD)
        }
      }
    } finally {
      restore()
    }
  })

  test('the scroll height does not change when a group row is carried', async () => {
    const restore = useStickySkin()
    try {
      const api = await mountScroll({})
      const box = api.box()
      // Measure every item once, so the counted heights are the real ones.
      for (let top = 0; top < box.scrollHeight; top += 200) {
        await scrollTo(box, top)
      }
      await scrollTo(box, 0)
      const height = box.scrollHeight
      // 1000 rows and 8 group rows under the header.
      expect(
        Math.abs(height - (1000 * ROW + 8 * GROUP + STICKY_HEAD))
      ).toBeLessThan(3)
      for (const top of [1500, 3010, 6000, 9000]) {
        await scrollTo(box, top)
        expect(Math.abs(box.scrollHeight - height)).toBeLessThan(2)
        expect(Math.abs(box.scrollTop - top)).toBeLessThan(2)
      }
    } finally {
      restore()
    }
  })

  test('with rowHeight the group row is groupRowHeight tall and nothing is measured', async () => {
    const api = await mountScroll({
      virtual: { rowHeight: 20, groupRowHeight: 40, overscan: 0 }
    })
    const box = api.box()
    await scrollTo(box, 0)
    const below = spacers().at(-1)!
    // All 1000 rows and 8 group rows, minus the drawn ones.
    const drawnRows = drawnIndexes().length
    const drawnGroups = groupRows().length
    expect(Number.parseFloat(below.style.height)).toBe(
      1000 * 20 + 8 * 40 - drawnRows * 20 - drawnGroups * 40
    )
    // In the middle of group 1: its group row is carried, its 40px taken
    // from the upper spacer.
    await scrollTo(box, 125 * 20 + 40 + 50 * 20)
    const [above] = spacers()
    const first = drawnIndexes()[0]
    expect(groupRows()[0].textContent.trim()).toBe('g1')
    expect(Number.parseFloat(above.style.height)).toBe(first * 20 + 2 * 40 - 40)
  })

  test('scrollToIndex shows the first row of a group under its group row, and any other row below the sticky one', async () => {
    const restore = useStickySkin()
    try {
      const api = await mountScroll({})
      const box = api.box()
      api.table().scrollToIndex(250, { align: 'start' })
      await frames(6)
      const view = box.getBoundingClientRect()
      const group = groupRows().find(tr => tr.textContent.trim() === 'g2')!
      expect(Math.round(group.getBoundingClientRect().top - view.top)).toBe(
        STICKY_HEAD
      )
      api.table().scrollToIndex(300, { align: 'start' })
      await frames(6)
      const row = document.querySelector('tr[data-row-index="300"]')!
      expect(Math.round(row.getBoundingClientRect().top - view.top)).toBe(
        STICKY_HEAD + GROUP
      )
    } finally {
      restore()
    }
  })

  test('the focused row kept drawn above the window keeps one group row per group', async () => {
    const restore = useStickySkin()
    try {
      const api = await mountScroll({ selection: {} })
      const box = api.box()
      await scrollTo(box, 2000)
      const input = document.querySelector<HTMLInputElement>(
        'tr[data-row-index] input.qt-select-row'
      )!
      const kept = input.closest('tr')!.dataset.rowIndex
      input.focus()
      // Within the same group, then into the next one.
      for (const top of [2600, 4500]) {
        await scrollTo(box, top)
        expect(drawnIndexes()).toContain(Number(kept))
        const groups = groupRows().map(tr => tr.textContent.trim())
        expect(new Set(groups).size).toBe(groups.length)
        expectAriaInOrder()
      }
      input.blur()
    } finally {
      restore()
    }
  })

  test('with infinite and more to load the row count is unknown', async () => {
    await mountScroll({ infinite: true }, 50)
    expect(
      document.querySelector('.qt-table')!.getAttribute('aria-rowcount')
    ).toBe('-1')
  })

  test('a live update with new objects and a row added above keeps the view and flashes no group row', async () => {
    const restore = useStickySkin()
    try {
      // The task monitor: the whole list again, as new objects, with a new
      // row in the first group, above the view.
      const groupBy = (row: ScrollRow) =>
        row.id > 100_000 ? 'g0' : `g${Math.floor((row.id - 1) / 125)}`
      const api = await mountScroll({ rowKey: 'id', flash: true, groupBy })
      const box = api.box()
      await scrollTo(box, 3000)
      // A row in the middle of the view, found by its name.
      const index = drawnIndexes()[Math.floor(drawnIndexes().length / 2)]
      const name = `Name ${index + 1}`
      const byName = () =>
        [...document.querySelectorAll<HTMLElement>('tr[data-row-index]')].find(
          tr =>
            tr.textContent.includes(`${name}`) &&
            !tr.textContent.includes(`${name}0`)
        )!
      const before = byName().getBoundingClientRect().top
      const next = scrollRows(1000).map(row => ({ ...row }))
      next.splice(10, 0, { id: 100_001, name: 'New', age: 1 })
      api.setRows(next)
      await frames(4)
      const row = byName()
      expect(row.dataset.rowIndex).toBe(String(index + 1))
      expect(Math.abs(row.getBoundingClientRect().top - before)).toBeLessThan(2)
      expect(
        document.querySelectorAll('tr.qt-group-row[data-flash]')
      ).toHaveLength(0)
      expect(new Set(groupRows().map(tr => tr.textContent.trim())).size).toBe(
        groupRows().length
      )
      expectAriaInOrder()
    } finally {
      restore()
    }
  })

  test('with infinite and a known total the group rows still to load keep the count unknown', async () => {
    // 50 of 100 rows given: the data count is known, the groups to come are not.
    await mountScroll({ infinite: true, totalRows: 100 }, 50)
    const table = document.querySelector('.qt-table')!
    expect(table.getAttribute('aria-rowcount')).toBe('-1')
    cleanup()
    // All rows given: header, 50 rows and their one group row.
    await mountScroll({ infinite: true, totalRows: 50 }, 50)
    expect(
      document.querySelector('.qt-table')!.getAttribute('aria-rowcount')
    ).toBe('52')
  })
})

describe('C-103 Grouping off and DOM contract of 3.8 [own]', () => {
  test('without groupBy no group row is drawn', async () => {
    await mountScroll({ groupBy: undefined })
    expect(groupRows()).toHaveLength(0)
    expect(
      document.querySelector('.qt-table')!.getAttribute('aria-rowcount')
    ).toBe('1001')
  })

  test('the DOM with group rows matches the DOM contract', async () => {
    const dom = createCollector()
    await render(QueryTable as never, {
      props: {
        columns,
        rows: items(['a', 'a', 'b']),
        totalRows: 3,
        query: makeQuery(),
        rowKey: 'id',
        groupBy: (row: Item) => row.kind
      } as never
    })
    await frames(1)
    dom.collect()
    cleanup()
    await mountScroll({})
    await frames(1)
    dom.collect()
    cleanup()
    dom.expectNothingOutsideContract()
    dom.expectEntriesRendered(entry => entry.addedBy === 'C-101')
  })
})
