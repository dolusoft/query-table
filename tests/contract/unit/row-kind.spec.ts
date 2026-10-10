import { afterEach, describe, expect, it } from 'vitest'

import {
  makeRows,
  mountTable,
  type Mounted,
  type Row
} from '../../support/mount-table'

// C-97: `rowKind` names a kind per row as `data-row-kind`; the table takes no
// class or style per row (P5), and draws nothing by the kind.

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

const kinds = (m: Mounted) =>
  m.wrapper
    .findAll('tbody > tr[data-row-index]')
    .map(tr => tr.attributes('data-row-kind') ?? null)

describe('C-97 Row kind [own]', () => {
  it('writes the kind rowKind returns on each body row, by row and index', () => {
    const seen: Array<[number, number]> = []
    const m = mountIt({
      rowKind: (row: Row, index: number) => {
        seen.push([row.id, index])
        return row.id === 5 ? 'total' : undefined
      }
    })
    expect(kinds(m)).toEqual([null, null, null, null, 'total'])
    expect(seen).toEqual(
      expect.arrayContaining([
        [1, 0],
        [5, 4]
      ])
    )
  })

  it('writes no attribute for an empty string, null or undefined', () => {
    const values = ['', null, undefined, 'a b', 'others']
    const m = mountIt({
      rowKind: (_row: Row, index: number) => values[index]
    })
    expect(kinds(m)).toEqual([null, null, null, 'a b', 'others'])
  })

  it('writes no attribute anywhere without rowKind', () => {
    const m = mountIt({ hasSubtable: true })
    expect(m.wrapper.find('[data-row-kind]').exists()).toBe(false)
  })

  it('follows rows and rowKind when they change, and leaves the rest of the row alone', async () => {
    const m = mountIt({
      rowKey: 'id',
      rowKind: (row: Row) => (row.id === 1 ? 'first' : null)
    })
    const before = m.wrapper.find('tbody').html()
    await m.wrapper.setProps({ rows: [...makeRows()].reverse() })
    expect(kinds(m)).toEqual([null, null, null, null, 'first'])
    await m.wrapper.setProps({
      rowKind: (row: Row) => (row.id === 3 ? 'middle' : null)
    })
    expect(kinds(m)).toEqual([null, null, 'middle', null, null])
    await m.wrapper.setProps({ rowKind: undefined, rows: makeRows() })
    // Without a kind the body is the one drawn before, attribute aside.
    expect(m.wrapper.find('tbody').html()).toBe(
      before.replace(' data-row-kind="first"', '')
    )
  })

  it('puts the kind on a pinned row and not on a subtable row', async () => {
    const m = mountIt(
      {
        rowKey: 'id',
        hasSubtable: true,
        rowPinning: { top: ['4'], bottom: [] },
        rowKind: (row: Row) => (row.id === 4 ? 'others' : null)
      },
      { slots: { subtable: '<b class="detail">detail</b>' } }
    )
    const first = m.wrapper.find('tbody > tr')
    expect(first.attributes('data-pinned-row')).toBe('top')
    expect(first.attributes('data-row-kind')).toBe('others')
    await first.find('.qt-expand').trigger('click')
    const subtable = m.wrapper.find('.qt-subtable-row')
    expect(subtable.exists()).toBe(true)
    expect(subtable.attributes('data-row-kind')).toBeUndefined()
  })
})
