import axe from 'axe-core'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'

import type { Column } from '@dolusoft/query-table'

import { makeQuery, rows } from '../../support/fixtures'
import { renderTable } from '../../support/helpers'
import {
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  type HostApi
} from '../../support/scroll-host'

// C-103 and C-104 with `scrollBody` (C-101, C-102): the group rows are rows
// of the body table, the sticky group cell sticks to the top of the body
// scroller (the header is outside it), and the counts of assistive
// technology still take the group rows.

let style: HTMLStyleElement
beforeAll(() => {
  style = document.createElement('style')
  style.textContent = [
    '.qt-table-body { height: 200px; }',
    '.qt-table-body tbody > tr > td { height: 24px; padding: 0; box-sizing: border-box; }',
    '.qt-table-body tr.qt-group-row > th { position: sticky; top: 0; z-index: 1; height: 30px; padding: 0; box-sizing: border-box; }'
  ].join(' ')
  document.head.append(style)
})
afterAll(() => style.remove())
afterEach(() => cleanup())

const columns: Column[] = [
  { field: 'id', title: 'ID', type: 'number', width: '120px' },
  { field: 'name', title: 'Name', width: '300px' }
]
/** 200 rows in groups of 25 by id. */
const groupBy = (row: { id: number }) => `g${Math.floor((row.id - 1) / 25)}`

const mount = async (props: Record<string, unknown> = {}) => {
  await renderTable({
    scrollBody: true,
    columns,
    rows: rows(200),
    totalRows: 200,
    query: makeQuery({ pageSize: 200 }),
    rowKey: 'id',
    groupBy,
    ...props
  })
  await frames(3)
}

const body = () => document.querySelector<HTMLElement>('.qt-table-body')!
const groupRows = () => [
  ...document.querySelectorAll<HTMLElement>('.qt-table-body tr.qt-group-row')
]

describe.each([false, true])(
  'C-103 C-104 grouped rows with scrollBody, virtual %s [own]',
  virtual => {
    test('the group rows are in the body table only, spanning every column', async () => {
      await mount({ virtual })
      expect(
        document.querySelectorAll('.qt-table-head tr.qt-group-row')
      ).toHaveLength(0)
      const first = groupRows()[0]
      expect(first.textContent.trim()).toBe('g0')
      const cell = first.querySelector('th')!
      expect(cell.colSpan).toBe(2)
      const row = body().querySelector('tr[data-row-index]')!
      expect(Math.round(cell.getBoundingClientRect().width)).toBe(
        Math.round(row.getBoundingClientRect().width)
      )
    })

    test('the group cell of the top group sticks to the top of the body scroller', async () => {
      await mount({ virtual })
      const scroller = body()
      // Into the middle of the third group (rows 50 to 74).
      await scrollTo(scroller, 2 * (30 + 25 * 24) + 10 * 24)
      await frames(3)
      const { top, left } = scroller.getBoundingClientRect()
      // Earlier group cells stick too, under it: the one seen is the
      // current group's.
      const seen = document.elementFromPoint(left + 20, top + 5)
      expect(seen?.closest('tr.qt-group-row')?.textContent.trim()).toBe('g2')
      // A group never has two group rows.
      const names = groupRows().map(tr => tr.textContent.trim())
      expect(new Set(names).size).toBe(names.length)
    })

    test('the axe scan finds no violation', async () => {
      // As in the C-102 scan: the expand buttons make the body scroller
      // reachable by keyboard.
      await mount({ virtual, hasSubtable: true })
      const result = await axe.run(document.querySelector('.qt-datatable')!, {
        resultTypes: ['violations']
      })
      expect(
        result.violations.map(
          v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`
        )
      ).toEqual([])
    })
  }
)

describe('C-104 grouped rows with scrollBody and virtual: counts [own]', () => {
  test('`aria-rowcount` on the table role counts the header, the rows and the group rows', async () => {
    await mount({ virtual: true })
    const root = document.querySelector('.qt-table-responsive')!
    expect(root.getAttribute('aria-rowcount')).toBe(String(1 + 200 + 8))
    const first = groupRows()[0]
    expect(first.getAttribute('aria-rowindex')).toBe('2')
    expect(
      body()
        .querySelector('tr[data-row-index="0"]')!
        .getAttribute('aria-rowindex')
    ).toBe('3')
  })

  test('one table for assistive technology, with the group headers in it', async () => {
    await mount({ virtual: true })
    const tree = await commands.ariaSnapshot('.qt-table-responsive')
    const lines = tree.split('\n').map(line => line.trim())
    expect(lines.filter(line => line.startsWith('- table'))).toHaveLength(1)
    expect(tree).toContain('- rowheader "g0"')
  })

  test('scrollToIndex shows the first row of a group with its group row above it, and another row below the sticky group cell', async () => {
    let api: HostApi | null = null
    await render(ScrollHost as never, {
      props: {
        rows: scrollRows(1000),
        tableProps: {
          scrollBody: true,
          virtual: true,
          groupBy: (row: { id: number }) => `g${Math.floor((row.id - 1) / 125)}`
        },
        height: 0,
        api: (given: HostApi) => {
          api = given
        }
      } as never
    })
    await frames(4)
    const scroller = body()
    const top = () => scroller.getBoundingClientRect().top
    api!.table().scrollToIndex(250, { align: 'start' })
    await frames(6)
    const head = groupRows().find(tr => tr.textContent.trim() === 'g2')!
    expect(Math.abs(head.getBoundingClientRect().top - top())).toBeLessThan(1)
    const first = scroller.querySelector('tr[data-row-index="250"]')!
    expect(
      Math.abs(
        first.getBoundingClientRect().top - head.getBoundingClientRect().bottom
      )
    ).toBeLessThan(1)
    api!.table().scrollToIndex(300, { align: 'start' })
    await frames(6)
    const row = scroller.querySelector('tr[data-row-index="300"]')!
    const stuck = groupRows().find(tr => tr.textContent.trim() === 'g2')!
    expect(
      Math.abs(
        row.getBoundingClientRect().top -
          stuck.querySelector('th')!.getBoundingClientRect().bottom
      )
    ).toBeLessThan(1)
  })
})
