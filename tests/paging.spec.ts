import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

import {
  flush,
  makeQuery,
  makeRows,
  mountTable,
  reasons,
  type MountOptions,
  type Mounted
} from './helpers'
import type { FilterMenuSlotProps, PaginationSlotProps } from '../src/contract'

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

/** Mounts a table whose `pagination` slot hands its props out to the test. */
const mountPaged = (
  props: Record<string, unknown> = {},
  options: MountOptions = {}
) => {
  const box: { slot: PaginationSlotProps | null } = { slot: null }
  mounted = mountTable(props, {
    ...options,
    slots: {
      pagination: (slot: PaginationSlotProps) => {
        box.slot = slot
        return h('i', { class: 'paged' })
      },
      ...options.slots
    }
  })
  return { m: mounted, box }
}

describe('C-05 Paging', () => {
  it('nextPage and previousPage emit reason page and change only the page', async () => {
    const query = makeQuery({
      page: 2,
      pageSize: 5,
      sort: { field: 'name', direction: 'asc' },
      filters: [{ field: 'age', condition: 'Equal', value: 25 }]
    })
    const { m, box } = mountPaged({ query, totalRows: 45 })
    box.slot!.nextPage()
    await flush()
    box.slot!.previousPage()
    await flush()
    expect(reasons(m.events)).toEqual(['page', 'page'])
    expect(m.events[0][0]).toEqual({ ...query, page: 3 })
    expect(m.events[1][0]).toEqual(query)
  })

  it('setPage clamps to [1, pageCount] when the total is known', async () => {
    const { m, box } = mountPaged({ totalRows: 45 })
    box.slot!.setPage(99)
    await flush()
    expect(m.query().page).toBe(5)
    box.slot!.setPage(-4)
    await flush()
    expect(m.query().page).toBe(1)
    box.slot!.setPage(2.9)
    await flush()
    expect(m.query().page).toBe(2)
  })

  it('does nothing past either end', async () => {
    const { m, box } = mountPaged({
      totalRows: 45,
      query: makeQuery({ page: 5 })
    })
    box.slot!.nextPage()
    await flush()
    expect(m.events).toEqual([])
    await m.setQuery(makeQuery({ page: 1 }))
    box.slot!.previousPage()
    await flush()
    expect(m.events).toEqual([])
  })

  it('does not clamp when the total is unknown', async () => {
    const { m, box } = mountPaged({ totalRows: null })
    box.slot!.setPage(50)
    await flush()
    expect(m.query().page).toBe(50)
  })
})

describe('C-06 Page size', () => {
  it('emits one update with reason pageSize and page 1', async () => {
    const { m, box } = mountPaged({
      query: makeQuery({
        page: 4,
        sort: { field: 'name', direction: 'desc' }
      }),
      totalRows: 100
    })
    box.slot!.setPageSize(20)
    await flush()
    expect(reasons(m.events)).toEqual(['pageSize'])
    expect(m.events[0][0]).toEqual(
      makeQuery({
        page: 1,
        pageSize: 20,
        sort: { field: 'name', direction: 'desc' }
      })
    )
  })

  it.each([0, -5, 2.5, Number.NaN])('ignores %s', async size => {
    const { m, box } = mountPaged({ totalRows: 100 })
    box.slot!.setPageSize(size)
    await flush()
    expect(m.events).toEqual([])
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

describe('C-23 Page count and neighbours', () => {
  it.each([
    [45, 10, 5],
    [50, 10, 5],
    [51, 10, 6],
    [0, 10, 1],
    [1, 100, 1]
  ])(
    'totalRows %i with page size %i has %i pages',
    (totalRows, pageSize, count) => {
      const { box } = mountPaged({
        totalRows,
        rows: makeRows(),
        query: makeQuery({ pageSize })
      })
      expect(box.slot!.pageCount).toBe(count)
    }
  )

  it('pageCount is null when the total is unknown', () => {
    const { box } = mountPaged({ totalRows: null })
    expect(box.slot!.pageCount).toBeNull()
    expect(box.slot!.totalRows).toBeNull()
  })

  it('canPrevious is page > 1 and canNext is page < pageCount', async () => {
    const { m, box } = mountPaged({ totalRows: 25 })
    expect([box.slot!.canPrevious, box.slot!.canNext]).toEqual([false, true])
    await m.setQuery(makeQuery({ page: 2 }))
    expect([box.slot!.canPrevious, box.slot!.canNext]).toEqual([true, true])
    await m.setQuery(makeQuery({ page: 3 }))
    expect([box.slot!.canPrevious, box.slot!.canNext]).toEqual([true, false])
  })

  it('without a total, canNext is rows.length >= pageSize', async () => {
    const { m, box } = mountPaged({
      totalRows: null,
      query: makeQuery({ pageSize: 5 })
    })
    expect(box.slot!.canNext).toBe(true)
    await m.wrapper.setProps({ rows: makeRows().slice(0, 4) })
    expect(box.slot!.canNext).toBe(false)
  })

  it('hands the page size options to the slot', () => {
    expect(mountPaged().box.slot!.pageSizeOptions).toEqual([
      10, 20, 30, 50, 100
    ])
    mounted?.wrapper.unmount()
    expect(
      mountPaged({ pagination: { pageSizeOptions: [5, 15] } }).box.slot!
        .pageSizeOptions
    ).toEqual([5, 15])
  })
})

describe('C-24 Rows do not depend on the total', () => {
  it('draws every row whatever totalRows says, and decides emptiness from rows', async () => {
    mounted = mountTable({ totalRows: 0 })
    expect(mounted.wrapper.findAll('tbody tr')).toHaveLength(5)
    expect(mounted.wrapper.find('.bh-datatable').attributes('data-empty')).toBe(
      undefined
    )
    await mounted.wrapper.setProps({ rows: [], totalRows: 100 })
    expect(mounted.wrapper.find('.bh-datatable').attributes('data-empty')).toBe(
      ''
    )
  })
})

describe('C-25 Pagination block', () => {
  it('is drawn with rows, with a positive total, or when alwaysShow is set', async () => {
    mounted = mountTable({ rows: [], totalRows: null })
    expect(mounted.wrapper.find('.bh-pagination').exists()).toBe(false)
    await mounted.wrapper.setProps({ totalRows: 12 })
    expect(mounted.wrapper.find('.bh-pagination').exists()).toBe(true)
    await mounted.wrapper.setProps({ totalRows: 0, rows: makeRows() })
    expect(mounted.wrapper.find('.bh-pagination').exists()).toBe(true)
    await mounted.wrapper.setProps({
      rows: [],
      pagination: { alwaysShow: true }
    })
    expect(mounted.wrapper.find('.bh-pagination').exists()).toBe(true)
  })

  it('carries the page and the page size as data attributes', () => {
    mounted = mountTable({ query: makeQuery({ page: 2, pageSize: 20 }) })
    const block = mounted.wrapper.find('.bh-pagination')
    expect(block.attributes('data-page')).toBe('2')
    expect(block.attributes('data-page-size')).toBe('20')
  })

  it('is not drawn with pagination false, and the slot needs to be given', () => {
    mounted = mountTable({ pagination: false })
    expect(mounted.wrapper.find('.bh-pagination').exists()).toBe(false)
    mounted.wrapper.unmount()

    mounted = mountTable({}, { slots: { pagination: undefined as never } })
    expect(mounted.wrapper.find('.bh-pagination').exists()).toBe(false)
  })

  it('emits no page or pageSize update with pagination false', async () => {
    mounted = mountTable({ pagination: false, sortable: true })
    await mounted.wrapper
      .find('th[data-field="name"] .bh-sort')
      .trigger('click')
    expect(reasons(mounted.events)).toEqual(['sort'])
  })
})
