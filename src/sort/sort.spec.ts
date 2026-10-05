import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

import { nextDirection } from './sort'
import {
  flush,
  makeQuery,
  mountTable,
  reasons,
  type Mounted
} from '../../test-support/mount-table'
import type { FilterMenuSlotProps } from '../contract'

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

describe('sort direction', () => {
  it('C-07 sorts ascending first, then flips', () => {
    expect(nextDirection(null, 'a')).toBe('asc')
    expect(nextDirection({ field: 'a', direction: 'asc' }, 'a')).toBe('desc')
    expect(nextDirection({ field: 'a', direction: 'desc' }, 'a')).toBe('asc')
    expect(nextDirection({ field: 'a', direction: 'desc' }, 'b')).toBe('asc')
  })
})

describe('C-07 Header sort', () => {
  it('sorts ascending first, then flips, and keeps the page', async () => {
    mounted = mountTable({
      sortable: true,
      totalRows: 50,
      query: makeQuery({ page: 3 })
    })
    const m = mounted
    const click = () =>
      m.wrapper.find('th[data-field="name"] .bh-sort').trigger('click')
    await click()
    await click()
    await click()
    expect(reasons(m.events)).toEqual(['sort', 'sort', 'sort'])
    expect(m.events.map(([q]) => q.sort?.direction)).toEqual([
      'asc',
      'desc',
      'asc'
    ])
    expect(m.events.every(([q]) => q.page === 3)).toBe(true)
  })

  it('moves to another column ascending', async () => {
    mounted = mountTable({
      sortable: true,
      query: makeQuery({ sort: { field: 'name', direction: 'desc' } })
    })
    await mounted.wrapper.find('th[data-field="age"] .bh-sort').trigger('click')
    expect(mounted.events[0][0].sort).toEqual({
      field: 'age',
      direction: 'asc'
    })
  })

  it('draws no sort button when the table or the column is not sortable', () => {
    mounted = mountTable({ sortable: false })
    expect(mounted.wrapper.find('.bh-sort').exists()).toBe(false)
    mounted.wrapper.unmount()

    mounted = mountTable({
      sortable: true,
      columns: [
        { field: 'name', title: 'Name' },
        { field: 'age', title: 'Age', sortable: false }
      ]
    })
    expect(
      mounted.wrapper.find('th[data-field="name"] .bh-sort').exists()
    ).toBe(true)
    expect(mounted.wrapper.find('th[data-field="age"] .bh-sort').exists()).toBe(
      false
    )
    expect(mounted.wrapper.find('th[data-field="age"] .bh-title').text()).toBe(
      'Age'
    )
  })
})

describe('C-08 Sort from the filter menu', () => {
  it('setSort emits reason sort with that direction and keeps the page', async () => {
    const menus: Record<string, FilterMenuSlotProps> = {}
    mounted = mountTable(
      { filterable: true, sortable: true, query: makeQuery({ page: 2 }) },
      {
        slots: {
          'filter-menu': (menu: FilterMenuSlotProps) => {
            menus[menu.column.field] = menu
            return h(menu.trigger)
          }
        }
      }
    )
    menus.name.setSort('desc')
    await flush()
    expect(reasons(mounted.events)).toEqual(['sort'])
    expect(mounted.events[0][0]).toEqual(
      makeQuery({ page: 2, sort: { field: 'name', direction: 'desc' } })
    )
    expect(menus.name.sortable).toBe(true)
  })
})

describe('C-08 Sort from the filter menu when sorting is off', () => {
  const menusOf = (props: Record<string, unknown>) => {
    const menus: Record<string, FilterMenuSlotProps> = {}
    const m = mountTable(
      { filterable: true, ...props },
      {
        slots: {
          'filter-menu': (menu: FilterMenuSlotProps) => {
            menus[menu.column.field] = menu
            return h(menu.trigger)
          }
        }
      }
    )
    mounted = m
    return { menus, m }
  }

  it('setSort does nothing on a column with sortable: false', async () => {
    const { menus, m } = menusOf({
      sortable: true,
      columns: [
        { field: 'name', title: 'Name', sortable: false },
        { field: 'age', title: 'Age', type: 'number' }
      ]
    })
    expect(menus.name.sortable).toBe(false)
    menus.name.setSort('asc')
    await flush()
    expect(m.events).toEqual([])
    // the sortable column next to it still sorts
    menus.age.setSort('asc')
    await flush()
    expect(reasons(m.events)).toEqual(['sort'])
  })

  it('setSort does nothing when the table is not sortable', async () => {
    const { menus, m } = menusOf({ sortable: false })
    expect(menus.name.sortable).toBe(false)
    menus.name.setSort('desc')
    await flush()
    expect(m.events).toEqual([])
  })
})
