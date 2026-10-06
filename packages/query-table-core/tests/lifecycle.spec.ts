import type { FilterRule } from '@dolusoft/query-protocol'
import {
  columnFilteringFeature,
  constructTable,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { filterInputFeature } from '../src/features/filter-input'
import { serverQueryFeature } from '../src/features/server-query'
import {
  currentReason,
  dispatch,
  dispose,
  hasRecord,
  isDisposed,
  markEmitted,
  onBeforeAction,
  onDispose,
  runBeforeAction
} from '../src/shared'
import { makeTable, start } from './support/table'

const rule = (field: string, value: string): FilterRule => ({
  field,
  condition: 'Contains',
  value
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('shared/ actions', () => {
  it('runBeforeAction tells whether a flush emitted', () => {
    const table = {}
    onBeforeAction(table, () => {})
    expect(runBeforeAction(table)).toBe(false)
    onBeforeAction(table, () => markEmitted(table))
    expect(runBeforeAction(table)).toBe(true)
  })

  it('dispatch carries its reason while the action runs, and nests', () => {
    const table = {}
    const seen: Array<string | null> = []
    expect(
      dispatch(
        table,
        () => {
          seen.push(currentReason(table))
          dispatch(table, () => seen.push(currentReason(table)))
          dispatch(table, () => seen.push(currentReason(table)), 'filter')
          markEmitted(table)
        },
        'reset'
      )
    ).toBe(true)
    seen.push(currentReason(table))
    expect(seen).toEqual(['reset', 'reset', 'filter', null])
  })
})

describe('C-62 Dispose and isolation [own]', () => {
  it('runs the cleanups once; later shared/ calls are no-ops', () => {
    const table = {}
    const cleanup = vi.fn()
    onDispose(table, cleanup)
    dispose(table)
    dispose(table)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(isDisposed(table)).toBe(true)
    // A late timer or event must not bring the record back.
    const flush = vi.fn()
    onBeforeAction(table, flush)
    markEmitted(table)
    onDispose(table, cleanup)
    expect(hasRecord(table)).toBe(false)
    expect(runBeforeAction(table)).toBe(false)
    expect(dispatch(table, flush)).toBe(false)
    expect(flush).not.toHaveBeenCalled()
    expect(currentReason(table)).toBeNull()
  })

  it('a disposed table emits nothing, pending text included', () => {
    const t = makeTable({ rowCount: 100 })
    t.column('name').setFilterInput('a')
    dispose(t.table)
    vi.runAllTimers()
    t.table.nextPage()
    t.column('age').toggleQuerySorting()
    t.table.setGlobalFilter('x')
    t.column('name').setFilterInput('b')
    t.table.clearAllFilters()
    expect(t.table.flushPendingFilters()).toBe(false)
    expect(t.updates).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    expect(hasRecord(t.table)).toBe(false)
  })

  it('two tables share nothing', () => {
    const a = makeTable({ answer: 'ignore', rowCount: 100 })
    const b = makeTable({ answer: 'ignore', rowCount: 100 })
    a.table.nextPage()
    expect(a.table.getBaseQuery()).toEqual(start({ page: 2 }))
    expect(b.table.getBaseQuery()).toEqual(start())
    a.column('name').setFilterInput('a')
    // b's action does not flush a's pending text.
    b.table.nextPage()
    expect(a.updates).toHaveLength(1)
    expect(b.updates).toEqual([[start({ page: 2 }), 'page']])
    dispose(a.table)
    b.column('name').setFilterInput('b')
    vi.runAllTimers()
    expect(b.reasons()).toEqual(['page', 'filter'])
    expect(a.updates).toHaveLength(1)
  })
})

describe('each plugin works on its own', () => {
  const columns = [
    { id: 'name', accessorKey: 'name' as const },
    { id: 'age', accessorKey: 'age' as const, filterType: 'number' as const }
  ]
  const data = [{ name: 'a', age: 1 }]

  it('serverQueryFeature without filterInputFeature', () => {
    const updates: unknown[] = []
    const table = constructTable({
      features: tableFeatures({
        coreReactivityFeature: storeReactivityBindings(),
        rowSortingFeature,
        rowPaginationFeature,
        columnFilteringFeature,
        serverQueryFeature
      }),
      columns,
      data,
      query: start(),
      onQueryChange: next => updates.push(next)
    })
    table.getColumn('name')!.toggleQuerySorting()
    table.getColumn('age')!.setFilterValue([rule('age', '1')])
    expect(updates).toHaveLength(2)
    expect('flushPendingFilters' in table).toBe(false)
  })

  it('filterInputFeature on plain TanStack state', () => {
    const table = constructTable({
      features: tableFeatures({
        coreReactivityFeature: storeReactivityBindings(),
        columnFilteringFeature,
        filterInputFeature
      }),
      columns,
      data,
      filterDebounce: 0
    })
    table.getColumn('name')!.setFilterInput('*x*,y')
    expect(table.store.state.columnFilters).toEqual([
      { id: 'name', value: [rule('name', 'x'), rule('name', 'y')] }
    ])
    expect(table.getColumn('name')!.getFilterInput().text).toBe('*x*,y')
    table.getColumn('age')!.setFilterInput('5')
    table.clearAllFilters()
    expect(table.store.state.columnFilters).toEqual([])
    expect('getBaseQuery' in table).toBe(false)
  })
})
