import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'

import { type RowSelection, useQueryTable } from '@dolusoft/query-table'

import {
  makeColumns,
  makeQuery,
  makeRows,
  mountTable,
  type Mounted,
  type MountOptions,
  type Row
} from '../../support/mount-table'

// C-130: with `selection`, `rowSelectable` says which rows can be selected. A
// row that cannot keeps its checkbox, `disabled`, and its key stays in the
// selection as given; the header checkbox works on the other rows only.

let mounted: Mounted | null = null
const mountIt = (props: Record<string, unknown>, options?: MountOptions) => {
  // `v-model:selection`: every emitted map is passed back.
  const m: Mounted = mountTable(
    {
      rowKey: 'id',
      'onUpdate:selection': (next: RowSelection) =>
        m.wrapper.setProps({ selection: next }),
      ...props
    },
    options
  )
  mounted = m
  return m
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

/** Row 5 (`Eve`, index 4) cannot be selected. */
const notEve = (row: Row) => row.id !== 5

const rowAt = (m: Mounted, index: number) =>
  m.wrapper.find(`tbody > tr[data-row-index="${index}"]`)
const boxAt = (m: Mounted, index: number) =>
  rowAt(m, index).find<HTMLInputElement>('.qt-select-row')
const header = (m: Mounted) =>
  m.wrapper.find<HTMLInputElement>('.qt-select-all')
const emitted = (m: Mounted) =>
  (m.wrapper.emitted('update:selection') ?? []).map(
    ([selection]) => selection as RowSelection
  )
const setHeader = async (m: Mounted, checked: boolean) => {
  header(m).element.checked = checked
  await header(m).trigger('change')
}

describe('C-130 Rows that cannot be selected [tanstack] [own]', () => {
  it('draws a disabled checkbox, checked when its key is selected', () => {
    const seen: Array<[number, number]> = []
    const m = mountIt({
      selection: { '5': true },
      rowSelectable: (row: Row, index: number) => {
        seen.push([row.id, index])
        return notEve(row)
      }
    })
    expect(m.wrapper.findAll('.qt-select-row')).toHaveLength(5)
    const eve = boxAt(m, 4)
    expect(eve.element.disabled).toBe(true)
    expect(eve.element.checked).toBe(true)
    expect(eve.attributes('disabled')).toBeDefined()
    expect(rowAt(m, 4).attributes('data-selected')).toBeDefined()
    for (const index of [0, 1, 2, 3]) {
      expect(boxAt(m, index).element.disabled).toBe(false)
      expect(boxAt(m, index).attributes('disabled')).toBeUndefined()
    }
    // The row keeps its cell, so the columns stay aligned.
    expect(rowAt(m, 4).findAll('td')).toHaveLength(
      rowAt(m, 0).findAll('td').length
    )
    expect(seen).toEqual(expect.arrayContaining([[5, 4]]))
  })

  it('a change on such a checkbox emits nothing', async () => {
    const m = mountIt({ selection: {}, rowSelectable: notEve })
    await boxAt(m, 4).trigger('change')
    expect(emitted(m)).toEqual([])
    await boxAt(m, 0).trigger('change')
    expect(emitted(m)).toEqual([{ '1': true }])
  })

  it('the header checkbox selects and deselects only the rows that can be selected', async () => {
    // `9` is a key of a row on another page.
    const m = mountIt({
      selection: { '5': true, '9': true },
      rowSelectable: notEve
    })
    // The selected row that cannot be selected does not count.
    expect(header(m).element.checked).toBe(false)
    expect(header(m).element.indeterminate).toBe(false)
    expect(header(m).element.disabled).toBe(false)

    await boxAt(m, 0).trigger('change')
    expect(header(m).element.indeterminate).toBe(true)

    await setHeader(m, true)
    expect(emitted(m).at(-1)).toEqual({
      '1': true,
      '2': true,
      '3': true,
      '4': true,
      '5': true,
      '9': true
    })
    expect(header(m).element.checked).toBe(true)
    expect(header(m).element.indeterminate).toBe(false)

    await setHeader(m, false)
    expect(emitted(m).at(-1)).toEqual({ '5': true, '9': true })
    expect(boxAt(m, 4).element.checked).toBe(true)
  })

  it('never adds the key of such a row and never drops it', async () => {
    const m = mountIt({ selection: {}, rowSelectable: notEve })
    await setHeader(m, true)
    expect(emitted(m).at(-1)).toEqual({
      '1': true,
      '2': true,
      '3': true,
      '4': true
    })
    await m.wrapper.setProps({ selection: { '5': true } })
    await boxAt(m, 1).trigger('change')
    expect(emitted(m).at(-1)).toEqual({ '5': true, '2': true })
    await boxAt(m, 1).trigger('change')
    expect(emitted(m).at(-1)).toEqual({ '5': true })
  })

  it('disables the header checkbox while no row can be selected, an empty page too', async () => {
    const m = mountIt({ selection: {}, rowSelectable: () => false })
    expect(header(m).element.disabled).toBe(true)
    expect(
      m.wrapper
        .findAll<HTMLInputElement>('.qt-select-row')
        .map(box => box.element.disabled)
    ).toEqual([true, true, true, true, true])
    await m.wrapper.setProps({ rowSelectable: notEve })
    expect(header(m).element.disabled).toBe(false)
    await m.wrapper.setProps({ rows: [], totalRows: 0 })
    expect(header(m).element.disabled).toBe(true)
    // Without `rowSelectable` an empty page keeps the header of 3.20.
    await m.wrapper.setProps({ rowSelectable: undefined })
    expect(header(m).element.disabled).toBe(false)
    expect(header(m).attributes('disabled')).toBeUndefined()
  })

  it('follows a new rowSelectable: the checkboxes and the header state', async () => {
    const m = mountIt({
      selection: { '1': true, '2': true, '3': true, '4': true }
    })
    expect(header(m).element.checked).toBe(false)
    expect(header(m).element.indeterminate).toBe(true)
    await m.wrapper.setProps({ rowSelectable: notEve })
    expect(boxAt(m, 4).element.disabled).toBe(true)
    expect(header(m).element.checked).toBe(true)
    expect(header(m).element.indeterminate).toBe(false)
    await m.wrapper.setProps({ rowSelectable: undefined })
    expect(boxAt(m, 4).element.disabled).toBe(false)
    expect(header(m).element.checked).toBe(false)
    expect(header(m).element.indeterminate).toBe(true)
  })

  it('works on a pinned row', () => {
    const m = mountIt({
      selection: {},
      rowPinning: { top: ['5'], bottom: [] },
      rowSelectable: notEve
    })
    const first = m.wrapper.findAll('tbody > tr[data-row-index]')[0]
    expect(first.attributes('data-pinned-row')).toBe('top')
    expect(
      first.find<HTMLInputElement>('.qt-select-row').element.disabled
    ).toBe(true)
  })

  it('does not call rowSelectable without selection', () => {
    let calls = 0
    const m = mountIt({
      rowSelectable: () => {
        calls += 1
        return true
      }
    })
    expect(m.wrapper.find('.qt-select-row').exists()).toBe(false)
    expect(calls).toBe(0)
  })

  it('composable: canSelect, toggle, canToggleAll and TanStack getCanSelect agree', () => {
    const scope = effectScope()
    const selection = ref<RowSelection>({})
    const changes: RowSelection[] = []
    const rowSelectable = ref<((row: Row) => boolean) | undefined>(notEve)
    const state = scope.run(() =>
      useQueryTable<Row>({
        query: makeQuery(),
        columns: makeColumns(),
        rows: makeRows(),
        rowKey: 'id',
        selection,
        rowSelectable,
        onSelectionChange: next => {
          changes.push(next)
          selection.value = next
        },
        onQueryChange: () => {}
      })
    )!
    const rows = makeRows()
    const { selection: api, table } = state
    expect(rows.map((row, i) => api.canSelect(row, i))).toEqual([
      true,
      true,
      true,
      true,
      false
    ])
    expect(table.getRowModel().rows.map(row => row.getCanSelect())).toEqual([
      true,
      true,
      true,
      true,
      false
    ])
    api.toggle(rows[4], 4)
    expect(changes).toEqual([])
    api.toggle(rows[0], 0)
    expect(changes).toEqual([{ '1': true }])
    expect(api.canToggleAll.value).toBe(true)
    api.toggleAll(true)
    expect(selection.value).toEqual({
      '1': true,
      '2': true,
      '3': true,
      '4': true
    })
    expect(api.allSelected.value).toBe(true)
    rowSelectable.value = () => false
    expect(api.canToggleAll.value).toBe(false)
    expect(table.getRowModel().rows[0].getCanSelect()).toBe(false)
    rowSelectable.value = undefined
    expect(api.canToggleAll.value).toBe(true)
    expect(api.canSelect(rows[4], 4)).toBe(true)
    expect(table.getRowModel().rows[4].getCanSelect()).toBe(true)
    scope.stop()
  })
})
