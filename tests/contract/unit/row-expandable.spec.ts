import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'

import { type QueryTableExpose, useQueryTable } from '@dolusoft/query-table'

import {
  makeColumns,
  makeQuery,
  makeRows,
  mountTable,
  type Mounted,
  type Row
} from '../../support/mount-table'

// C-98: with `hasSubtable`, `rowExpandable` says which rows can expand. A row
// that cannot keeps its expand cell (the columns stay aligned) but has no
// button, never draws the `subtable` slot and keeps no expansion state.

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

const subtable = { subtable: '<b class="detail">{{ params.row.name }}</b>' }
/** Row 5 (`Eve`, index 4) cannot expand. */
const notEve = (row: Row) => row.id !== 5

const rowAt = (m: Mounted, index: number) =>
  m.wrapper.find(`tbody > tr[data-row-index="${index}"]`)

describe('C-98 Rows that cannot expand [tanstack] [own]', () => {
  it('draws an empty expand cell, no button, for a row that cannot expand', () => {
    const seen: Array<[number, number]> = []
    const m = mountIt(
      {
        hasSubtable: true,
        rowExpandable: (row: Row, index: number) => {
          seen.push([row.id, index])
          return notEve(row)
        }
      },
      { slots: subtable }
    )
    expect(m.wrapper.findAll('.qt-expand')).toHaveLength(4)
    const eve = rowAt(m, 4)
    expect(eve.find('.qt-expand').exists()).toBe(false)
    // The cell stays, so the row has as many cells as an expandable one.
    expect(eve.findAll('td')).toHaveLength(rowAt(m, 0).findAll('td').length)
    expect(eve.findAll('td')).toHaveLength(makeColumns().length + 1)
    expect(eve.find('td').text()).toBe('')
    expect(seen).toEqual(expect.arrayContaining([[5, 4]]))
  })

  it('never opens such a row: not by expandAll, not by isExpanded', async () => {
    const rows = makeRows().map(row => ({ ...row, isExpanded: true }))
    const m = mountIt(
      { hasSubtable: true, rowKey: 'id', rows, rowExpandable: notEve },
      { slots: subtable }
    )
    expect(m.wrapper.findAll('.detail').map(d => d.text())).toEqual([
      'Charlie',
      'alice',
      'Bob',
      'Dave'
    ])
    expect(rowAt(m, 4).attributes('data-expanded')).toBeUndefined()
    const exposed = m.wrapper.vm as unknown as QueryTableExpose
    exposed.collapseAll()
    await m.wrapper.vm.$nextTick()
    expect(m.wrapper.find('.detail').exists()).toBe(false)
    exposed.expandAll()
    await m.wrapper.vm.$nextTick()
    expect(m.wrapper.findAll('.qt-subtable-row')).toHaveLength(4)
    expect(rowAt(m, 4).attributes('data-expanded')).toBeUndefined()
  })

  it('closes an open row that stops being expandable', async () => {
    const m = mountIt({ hasSubtable: true, rowKey: 'id' }, { slots: subtable })
    await rowAt(m, 4).find('.qt-expand').trigger('click')
    expect(m.wrapper.find('.detail').text()).toBe('Eve')
    await m.wrapper.setProps({ rowExpandable: notEve })
    expect(m.wrapper.find('.detail').exists()).toBe(false)
    expect(rowAt(m, 4).find('.qt-expand').exists()).toBe(false)
    // The key is dropped with the next rows, so it does not come back open.
    await m.wrapper.setProps({ rows: makeRows() })
    await m.wrapper.setProps({ rowExpandable: undefined })
    expect(m.wrapper.find('.detail').exists()).toBe(false)
    expect(m.wrapper.findAll('.qt-expand')).toHaveLength(5)
  })

  it('works on a pinned row', async () => {
    const m = mountIt(
      {
        hasSubtable: true,
        rowKey: 'id',
        rowPinning: { top: ['5'], bottom: ['1'] },
        rowExpandable: notEve
      },
      { slots: subtable }
    )
    const drawn = m.wrapper.findAll('tbody > tr[data-row-index]')
    expect(drawn[0].attributes('data-pinned-row')).toBe('top')
    expect(drawn[0].find('.qt-expand').exists()).toBe(false)
    const last = drawn[drawn.length - 1]
    expect(last.attributes('data-pinned-row')).toBe('bottom')
    await last.find('.qt-expand').trigger('click')
    expect(m.wrapper.find('.detail').text()).toBe('Charlie')
  })

  it('does not call rowExpandable without hasSubtable', () => {
    let calls = 0
    const m = mountIt({
      rowExpandable: () => {
        calls += 1
        return true
      }
    })
    expect(m.wrapper.find('.qt-expand').exists()).toBe(false)
    expect(calls).toBe(0)
  })

  it('composable: canExpand, toggle and TanStack getRowCanExpand agree', () => {
    const scope = effectScope()
    const hasSubtable = ref(true)
    const state = scope.run(() =>
      useQueryTable<Row>({
        query: makeQuery(),
        columns: makeColumns(),
        rows: makeRows(),
        rowKey: 'id',
        hasSubtable,
        rowExpandable: () => notEve,
        onQueryChange: () => {}
      })
    )!
    const rows = makeRows()
    const { expansion, table } = state
    expect(rows.map((row, i) => expansion.canExpand(row, i))).toEqual([
      true,
      true,
      true,
      true,
      false
    ])
    expect(table.getRowModel().rows.map(row => row.getCanExpand())).toEqual([
      true,
      true,
      true,
      true,
      false
    ])
    expansion.toggle(rows[4], 4)
    expect(expansion.isExpanded(rows[4], 4)).toBe(false)
    expansion.toggle(rows[0], 0)
    expect(expansion.isExpanded(rows[0], 0)).toBe(true)
    hasSubtable.value = false
    expect(expansion.canExpand(rows[0], 0)).toBe(false)
    expect(table.getRowModel().rows[0].getCanExpand()).toBe(false)
    scope.stop()
  })
})
