import { describe, expect, it } from 'vitest'

import { nextDirection } from './sort'
import { useSort } from './use-sort'
import { makeQuery } from '../../../../tests/support/mount-table'

describe('sort direction', () => {
  it('C-07 sorts ascending first, then descending, then none', () => {
    expect(nextDirection(null, 'a')).toBe('asc')
    expect(nextDirection({ field: 'a', direction: 'asc' }, 'a')).toBe('desc')
    expect(nextDirection({ field: 'a', direction: 'desc' }, 'a')).toBeNull()
    expect(nextDirection({ field: 'a', direction: 'asc' }, 'b')).toBe('asc')
    expect(nextDirection({ field: 'a', direction: 'desc' }, 'b')).toBe('asc')
  })
})

describe('C-07 sortBy guards non-sortable columns', () => {
  const setup = (sortable: boolean) => {
    const updates: unknown[][] = []
    let flushed = 0
    const query = makeQuery()
    const sort = useSort({
      sortable: () => sortable,
      query: () => query,
      base: () => query,
      update: (next, reason) => updates.push([next, reason]),
      flushFilters: () => {
        flushed += 1
      }
    })
    return { sort, updates, flushed: () => flushed }
  }

  it('does nothing, not even flushing a pending filter, when the table is not sortable', () => {
    const { sort, updates, flushed } = setup(false)
    sort.sortBy({ field: 'name' })
    sort.sortBy({ field: 'name' }, 'desc')
    expect(updates).toEqual([])
    expect(flushed()).toBe(0)
  })

  it('does nothing for a column with sortable: false, and sorts the others', () => {
    const { sort, updates, flushed } = setup(true)
    sort.sortBy({ field: 'name', sortable: false })
    expect(updates).toEqual([])
    expect(flushed()).toBe(0)
    sort.sortBy({ field: 'age' }, 'desc')
    expect(updates).toEqual([
      [makeQuery({ sort: { field: 'age', direction: 'desc' } }), 'sort']
    ])
    expect(flushed()).toBe(1)
  })
})
