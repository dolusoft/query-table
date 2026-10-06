import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, h } from 'vue'

import {
  type CellContextMenuPayload,
  type CellSlotProps,
  type RowPinning,
  useQueryTable
} from '@dolusoft/query-table'

import {
  deepFreeze,
  flush,
  makeColumns,
  makeQuery,
  makeRows,
  mountTable,
  type Mounted,
  type Row
} from '../../support/mount-table'

// C-74 (ADR 0007): the pinned rows are the consumer's `rowPinning` map. The
// table draws the rows of `rows` in top, center, bottom order and hands every
// change back as one `update:rowPinning`; it never writes the map and never
// asks for a row.

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

/** Mounts with a `cell-name` slot that keeps the slot props of each row by id. */
const mountPinning = (
  props: Record<string, unknown> = {},
  { writeBack = true }: { writeBack?: boolean } = {}
) => {
  const seen = new Map<number, CellSlotProps<Row>>()
  const changes: RowPinning[] = []
  const m: Mounted = mountTable(
    {
      rowKey: 'id',
      'onUpdate:rowPinning': (next: RowPinning) => {
        changes.push(next)
        if (writeBack) {
          void m.wrapper.setProps({ rowPinning: next })
        }
      },
      ...props
    },
    {
      slots: {
        'cell-name': (p: CellSlotProps<Row>) => {
          seen.set(p.row.id, p)
          return h('span', p.row.name)
        }
      }
    }
  )
  mounted = m
  return { m, seen, changes }
}

const bodyRows = (m: Mounted) =>
  m.wrapper.findAll('tbody > tr[data-row-index]').map(tr => tr.element)
const indexes = (m: Mounted) =>
  bodyRows(m).map(tr => Number(tr.getAttribute('data-row-index')))
const pinnedAttrs = (m: Mounted) =>
  bodyRows(m).map(tr => tr.getAttribute('data-pinned-row'))

describe('C-74 Row pinning [tanstack] [own]', () => {
  it('draws top rows first and bottom rows last, in map order', () => {
    const { m } = mountPinning({
      rowPinning: { top: ['3', '1'], bottom: ['2'] }
    })
    expect(indexes(m)).toEqual([2, 0, 3, 4, 1])
    expect(pinnedAttrs(m)).toEqual(['top', 'top', null, null, 'bottom'])
  })

  it.each([
    [{ top: ['3'] }, [2, 0, 1, 3, 4], ['top', null, null, null, null]],
    [{ bottom: ['2'] }, [0, 2, 3, 4, 1], [null, null, null, null, 'bottom']],
    [{}, [0, 1, 2, 3, 4], [null, null, null, null, null]]
  ])(
    'normalizes missing sides in a plain-JS map %j',
    (rowPinning, order, attrs) => {
      const input = deepFreeze(rowPinning)
      const { m, changes } = mountPinning({ rowPinning: input })
      expect(indexes(m)).toEqual(order)
      expect(pinnedAttrs(m)).toEqual(attrs)
      expect(changes).toEqual([])
      expect(m.wrapper.props()).toHaveProperty('rowPinning', input)
    }
  )

  it('the subtable row follows its row with the same attribute', () => {
    const rows = makeRows().map(row =>
      row.id === 3 ? { ...row, isExpanded: true } : row
    )
    const { m } = mountPinning(
      {
        rows,
        hasSubtable: true,
        rowPinning: { top: ['3'], bottom: [] }
      },
      {}
    )
    const all = m.wrapper.findAll('tbody > tr').map(tr => tr.element)
    expect(all[0].getAttribute('data-row-index')).toBe('2')
    expect(all[0].getAttribute('data-pinned-row')).toBe('top')
    expect(all[1].classList.contains('qt-subtable-row')).toBe(true)
    expect(all[1].getAttribute('data-pinned-row')).toBe('top')
    expect(all[2].getAttribute('data-pinned-row')).toBeNull()
  })

  it('keys outside rows are not drawn and stay', async () => {
    const { m, seen, changes } = mountPinning({
      rowPinning: { top: ['99'], bottom: [] }
    })
    expect(indexes(m)).toEqual([0, 1, 2, 3, 4])
    expect(pinnedAttrs(m).every(value => value === null)).toBe(true)
    seen.get(1)!.pinRow('top')
    await flush()
    expect(changes).toEqual([{ top: ['99', '1'], bottom: [] }])
    expect(indexes(m)).toEqual([0, 1, 2, 3, 4])
    expect(pinnedAttrs(m)[0]).toBe('top')
  })

  it('pinRow emits update:rowPinning and never update:query; the same position emits nothing', async () => {
    const { m, seen, changes } = mountPinning({
      rowPinning: { top: ['4', '3'], bottom: [] }
    })
    expect(seen.get(4)!.rowPinned).toBe('top')
    expect(seen.get(1)!.rowPinned).toBe(false)

    // `4` is not the last of `top`: TanStack would move it to the end.
    seen.get(4)!.pinRow('top')
    seen.get(5)!.pinRow(false)
    await flush()
    expect(changes).toEqual([])

    seen.get(1)!.pinRow('bottom')
    await flush()
    expect(changes).toEqual([{ top: ['4', '3'], bottom: ['1'] }])
    expect(seen.get(1)!.rowPinned).toBe('bottom')
    expect(indexes(m)).toEqual([3, 2, 1, 4, 0])

    seen.get(4)!.pinRow(false)
    await flush()
    expect(changes[1]).toEqual({ top: ['3'], bottom: ['1'] })
    expect(seen.get(4)!.rowPinned).toBe(false)
    expect(m.events).toEqual([])
  })

  it('an ignored update draws the old order', async () => {
    const { m, seen, changes } = mountPinning(
      { rowPinning: { top: [], bottom: [] } },
      { writeBack: false }
    )
    seen.get(3)!.pinRow('top')
    await flush()
    expect(changes).toEqual([{ top: ['3'], bottom: [] }])
    expect(indexes(m)).toEqual([0, 1, 2, 3, 4])
    expect(seen.get(3)!.rowPinned).toBe(false)
  })

  it('without rowKey the prop is ignored and pinRow does nothing', async () => {
    const { m, seen, changes } = mountPinning({
      rowKey: undefined,
      rowPinning: { top: ['2'], bottom: ['0'] }
    })
    expect(indexes(m)).toEqual([0, 1, 2, 3, 4])
    expect(pinnedAttrs(m).every(value => value === null)).toBe(true)
    expect(seen.get(3)!.rowPinned).toBe(false)
    seen.get(3)!.pinRow('top')
    await flush()
    expect(changes).toEqual([])
  })

  it('without rowPinning the rows are drawn as given and pinRow does nothing', async () => {
    const { m, seen, changes } = mountPinning()
    expect(indexes(m)).toEqual([0, 1, 2, 3, 4])
    expect(seen.get(1)!.rowPinned).toBe(false)
    seen.get(1)!.pinRow('top')
    await flush()
    expect(changes).toEqual([])
  })

  it('a page change keeps the map', async () => {
    const first = makeRows()
    const other = [
      { id: 6, name: 'Frank', age: 50, joined: '2024-06-01' },
      { id: 7, name: 'Grace', age: 45, joined: '2024-07-01' }
    ]
    const { m, changes } = mountPinning({
      rows: first,
      rowPinning: { top: ['4'], bottom: ['1'] }
    })
    await m.wrapper.setProps({ rows: other })
    await flush()
    expect(indexes(m)).toEqual([0, 1])
    expect(pinnedAttrs(m)).toEqual([null, null])
    await m.wrapper.setProps({ rows: first })
    await flush()
    expect(indexes(m)).toEqual([3, 1, 2, 4, 0])
    expect(changes).toEqual([])
    expect(m.events).toEqual([])
  })

  it('numeric keys are strings', () => {
    const { m } = mountPinning({
      rowKey: (row: Row) => row.id,
      rowPinning: { top: ['1'], bottom: [] }
    })
    expect(indexes(m)).toEqual([0, 1, 2, 3, 4])
    expect(pinnedAttrs(m)[0]).toBe('top')

    m.wrapper.unmount()
    const again = mountPinning({
      rowKey: (row: Row) => row.id,
      rowPinning: { top: ['5'], bottom: [] }
    })
    expect(indexes(again.m)).toEqual([4, 0, 1, 2, 3])
  })

  it('cellContextMenu keeps rowIndex an index into rows', async () => {
    const menus: CellContextMenuPayload<Row>[] = []
    const { m } = mountPinning({
      rowPinning: { top: ['4'], bottom: [] },
      onCellContextMenu: (payload: CellContextMenuPayload<Row>) =>
        menus.push(payload)
    })
    await m.wrapper
      .find('tbody > tr[data-pinned-row="top"] td[data-field="age"]')
      .trigger('contextmenu')
    expect(menus).toHaveLength(1)
    expect(menus[0].rowIndex).toBe(3)
    expect(menus[0].row.id).toBe(4)
  })

  it('works on frozen rowPinning', async () => {
    const { m, seen, changes } = mountPinning({
      rowPinning: deepFreeze({ top: ['2'], bottom: [] })
    })
    expect(indexes(m)).toEqual([1, 0, 2, 3, 4])
    seen.get(5)!.pinRow('top')
    await flush()
    expect(changes).toEqual([{ top: ['2', '5'], bottom: [] }])
    expect(Object.isFrozen(changes[0])).toBe(false)
  })
})

describe('C-74 composable: TanStack calls go to the consumer [tanstack]', () => {
  it('resetRowPinning on an empty map emits no update:rowPinning', () => {
    const changes: RowPinning[] = []
    const scope = effectScope()
    try {
      const state = scope.run(() =>
        useQueryTable({
          query: makeQuery(),
          columns: makeColumns(),
          rows: makeRows(),
          rowKey: 'id',
          rowPinning: deepFreeze({ top: [], bottom: [] }),
          onQueryChange: () => {},
          onRowPinningChange: next => changes.push(next)
        })
      )!
      state.table.resetRowPinning()
      expect(changes).toEqual([])
    } finally {
      scope.stop()
    }
  })

  it('row.pin calls onRowPinningChange and the slice stays the option', () => {
    const changes: RowPinning[] = []
    const rowPinning: RowPinning = { top: ['2'], bottom: [] }
    const scope = effectScope()
    const state = scope.run(() =>
      useQueryTable({
        query: makeQuery(),
        columns: makeColumns(),
        rows: makeRows(),
        rowKey: 'id',
        rowPinning,
        onQueryChange: () => {},
        onRowPinningChange: next => changes.push(next)
      })
    )!
    const { table } = state
    table.getRow('1').pin('top')
    expect(changes).toEqual([{ top: ['2', '1'], bottom: [] }])
    // The slice TanStack reads `getTopRows` from is the option, unchanged.
    expect(table.atoms.rowPinning.get()).toEqual(rowPinning)
    expect(state.rowPinning.enabled.value).toBe(true)
    expect(state.rowPinning.rows.value.map(item => item.index)).toEqual([
      1, 0, 2, 3, 4
    ])
    scope.stop()
  })
})
