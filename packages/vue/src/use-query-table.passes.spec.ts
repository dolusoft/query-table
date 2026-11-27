// @vitest-environment happy-dom
// A `rows` change reads only what it needs (P8, #266): with nothing open,
// selected or pinned, the table neither writes the expansion state again
// nor builds TanStack's row model. The answers stay the ones TanStack gives.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef, type EffectScope } from 'vue'

import type { Column, RowPinning, RowSelection, TableQuery } from './contract'
import { useQueryTable, type UseQueryTableOptions } from './use-query-table'

interface Row {
  id: number
  name: string
  isExpanded?: boolean
}

const columns: Column[] = [{ field: 'id', type: 'integer' }, { field: 'name' }]
const query: TableQuery = { page: 1, pageSize: 10, sort: null, filters: [] }
const makeRows = (count: number, name = 'row'): Row[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `${name} ${String(index + 1)}`
  }))

let scope: EffectScope | null = null
afterEach(() => {
  scope?.stop()
  scope = null
  vi.restoreAllMocks()
})

const setup = (options: Partial<UseQueryTableOptions<Row>> = {}) => {
  const rows = shallowRef(makeRows(3))
  scope = effectScope()
  const state = scope.run(() =>
    useQueryTable<Row>({
      query,
      columns,
      rows,
      rowKey: 'id',
      onQueryChange: () => {},
      ...options
    })
  )!
  return { rows, state }
}

describe('expansion state on a rows change', () => {
  it('is not written again with no row open and no subtable', async () => {
    const { rows, state } = setup()
    await nextTick()
    const before = state.table.atoms.expanded.get()
    rows.value = makeRows(3, 'changed')
    await nextTick()
    expect(state.table.atoms.expanded.get()).toBe(before)
  })

  it('is not written again with a subtable when the open rows stay', async () => {
    const { rows, state } = setup({ hasSubtable: true })
    state.expansion.toggle(rows.value[1], 1)
    await nextTick()
    const before = state.table.atoms.expanded.get()
    rows.value = makeRows(3, 'changed')
    await nextTick()
    expect(state.table.atoms.expanded.get()).toBe(before)
    expect(state.expansion.isExpanded(rows.value[1], 1)).toBe(true)
  })

  it('still follows a seed and drops a row that left (C-26)', async () => {
    const { rows, state } = setup({ hasSubtable: true })
    state.expansion.toggle(rows.value[2], 2)
    await nextTick()
    rows.value = [
      { id: 1, name: 'a', isExpanded: true },
      { id: 2, name: 'b' }
    ]
    await nextTick()
    expect(state.table.atoms.expanded.get()).toEqual({ '1': true })
  })
})

describe('header checkbox (C-64)', () => {
  it('reads no row model while no row is selected', () => {
    const selection = shallowRef<RowSelection>({ '1': false, '9': false })
    const { state } = setup({ selection })
    const model = vi.spyOn(state.table, 'getPaginatedRowModel')
    expect(state.selection.allSelected.value).toBe(false)
    expect(state.selection.someSelected.value).toBe(false)
    expect(model).not.toHaveBeenCalled()
  })

  it('asks TanStack once a row is selected', () => {
    const selection = shallowRef<RowSelection>({ '1': true })
    const { state } = setup({ selection })
    expect(state.selection.allSelected.value).toBe(false)
    expect(state.selection.someSelected.value).toBe(true)
    selection.value = { '1': true, '2': true, '3': true }
    expect(state.selection.allSelected.value).toBe(true)
    expect(state.selection.someSelected.value).toBe(false)
    // A selected row that is not on the page selects none of it.
    selection.value = { '9': true }
    expect(state.selection.allSelected.value).toBe(false)
    expect(state.selection.someSelected.value).toBe(false)
  })
})

describe('body rows with row pinning on (C-74)', () => {
  it('are `rows` in order, without the row model, while no row is pinned', () => {
    const rowPinning = shallowRef<RowPinning>({ top: [], bottom: [] })
    const { rows, state } = setup({ rowPinning })
    const model = vi.spyOn(state.table, 'getRowModel')
    expect(state.rowPinning.rows.value).toEqual(
      rows.value.map((row, index) => ({ row, index, pinned: false }))
    )
    expect(model).not.toHaveBeenCalled()
    rowPinning.value = { top: ['3'], bottom: [] }
    expect(state.rowPinning.rows.value.map(item => item.row.id)).toEqual([
      3, 1, 2
    ])
  })
})
