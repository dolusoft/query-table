import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref, type Component } from 'vue'

import QueryTable, {
  type Column,
  type FilterMenuSlotProps,
  type SortDirection
} from '@dolusoft/query-table'
import { CellCopy, CellPreview } from '@dolusoft/query-table/cells'
import { DataTable } from '@dolusoft/query-table/data-table'

import {
  makeQuery,
  makeRows,
  mountTable,
  type Mounted,
  type Row
} from '../../support/mount-table'

// C-131: a slot named after each built-in icon replaces its `svg` only; the
// button keeps its class, attributes and name. The cell components read
// `icon-copy` and `icon-preview` from the table they sit in.

let mounted: Mounted | null = null
let wrapper: VueWrapper | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
  wrapper?.unmount()
  wrapper = null
})

const columns: Column[] = [
  { field: 'name', title: 'Name', sortable: true, reorderable: true },
  { field: 'age', title: 'Age', type: 'number' }
]

/** An icon of the consumer's set: an `i` with the state it was given. */
const icon =
  (name: string) =>
  (state: Record<string, unknown> = {}) =>
    h('i', {
      class: `my-${name}`,
      ...Object.fromEntries(
        Object.entries(state).map(([key, value]) => [
          `data-${key}`,
          String(value)
        ])
      )
    })

describe('C-131 Icon slots [own]', () => {
  it('icon-sort replaces the sort icon and gets the direction', async () => {
    const m = mountIt(
      { columns, sortable: true },
      { slots: { 'icon-sort': icon('sort') } }
    )
    const button = () => m.wrapper.find('th[data-field="name"] .qt-sort')
    expect(button().find('.qt-sort-icon').exists()).toBe(false)
    expect(button().find('.my-sort').attributes('data-direction')).toBe('false')
    // The button's name is still its title.
    expect(button().text()).toBe('Name')
    await button().trigger('click')
    expect(button().find('.my-sort').attributes('data-direction')).toBe('asc')
    await button().trigger('click')
    expect(button().find('.my-sort').attributes('data-direction')).toBe('desc')
  })

  it('icon-filter replaces the funnel of the filter button, filled while the column has a rule', () => {
    const m = mountIt(
      {
        columns,
        filterable: true,
        query: makeQuery({
          filters: [{ field: 'name', condition: 'Contains', value: 'a' }]
        })
      },
      {
        slots: {
          'filter-menu': (menu: FilterMenuSlotProps) => h(menu.trigger),
          'icon-filter': icon('filter')
        }
      }
    )
    const button = (field: string) =>
      m.wrapper.find(`th[data-field="${field}"] .qt-filter-button`)
    expect(button('name').find('svg').exists()).toBe(false)
    expect(button('name').find('.my-filter').attributes('data-filled')).toBe(
      'true'
    )
    expect(button('age').find('.my-filter').attributes('data-filled')).toBe(
      'false'
    )
    expect(button('name').attributes('aria-label')).toBe(
      'Filter options for Name'
    )
  })

  it('icon-clear-all and icon-reorder replace the cross and the grip', () => {
    const m = mountIt(
      { columns, filterable: true, reorderable: true, hasRightPanel: true },
      {
        slots: {
          'icon-clear-all': icon('clear'),
          'icon-reorder': icon('grip')
        }
      }
    )
    const clear = m.wrapper.find('.qt-clear-all-button')
    expect(clear.find('svg').exists()).toBe(false)
    expect(clear.find('.my-clear').exists()).toBe(true)
    expect(clear.attributes('aria-label')).toBe('Clear all filters')
    const handle = m.wrapper.find('th[data-field="name"] .qt-reorder-handle')
    expect(handle.find('svg').exists()).toBe(false)
    expect(handle.find('.my-grip').exists()).toBe(true)
    expect(handle.attributes('aria-label')).toBe('Move Name')
  })

  it('icon-expand and icon-right-panel replace the row icons; the expand icon follows its row', async () => {
    let expandCalls = 0
    const m = mountIt(
      { rowKey: 'id', hasSubtable: true, hasRightPanel: true },
      {
        slots: {
          subtable: '<b class="detail">{{ params.row.name }}</b>',
          'icon-expand': (state: { expanded: boolean }) => {
            expandCalls += 1
            return icon('expand')(state)
          },
          'icon-right-panel': icon('panel')
        }
      }
    )
    const rowAt = (index: number) =>
      m.wrapper.find(`tbody > tr[data-row-index="${index}"]`)
    const expanded = () =>
      m.wrapper
        .findAll('tbody > tr[data-row-index] .my-expand')
        .map(i => i.attributes('data-expanded'))
    expect(m.wrapper.findAll('.qt-expand svg')).toHaveLength(0)
    expect(expanded()).toEqual(['false', 'false', 'false', 'false', 'false'])
    expect(rowAt(0).find('.qt-expand').attributes('aria-label')).toBe(
      'Expand row'
    )
    expect(rowAt(0).find('.qt-right-panel-button .my-panel').exists()).toBe(
      true
    )
    expect(m.wrapper.findAll('.qt-right-panel-button svg')).toHaveLength(0)

    // One row changes: only that row draws its icon again (C-106).
    const before = expandCalls
    await rowAt(0).find('.qt-expand').trigger('click')
    expect(expanded()).toEqual(['true', 'false', 'false', 'false', 'false'])
    expect(rowAt(0).attributes('aria-expanded')).toBeUndefined()
    expect(rowAt(0).find('.qt-expand').attributes('aria-expanded')).toBe('true')
    expect(expandCalls - before).toBe(1)

    await rowAt(0).find('.qt-right-panel-button').trigger('click')
    expect(m.wrapper.emitted('rowRightPanelClick')).toHaveLength(1)
  })

  it('follows a slot given or removed after mount, and without slots draws the built-in icons', async () => {
    const on = ref(true)
    const Host = defineComponent({
      setup: () => () =>
        h(
          QueryTable as unknown as Component,
          {
            columns,
            rows: makeRows(),
            totalRows: 5,
            query: makeQuery(),
            rowKey: 'id',
            sortable: true,
            hasSubtable: true
          },
          on.value
            ? {
                'icon-sort': icon('sort'),
                'icon-expand': icon('expand')
              }
            : {}
        )
    })
    wrapper = mount(Host, { attachTo: document.body })
    // `sortable` on the table: both columns sort.
    expect(wrapper.findAll('.my-sort')).toHaveLength(2)
    expect(wrapper.findAll('.my-expand')).toHaveLength(5)

    on.value = false
    await nextTick()
    await nextTick()
    expect(wrapper.findAll('.my-sort')).toHaveLength(0)
    expect(wrapper.findAll('.qt-sort-icon')).toHaveLength(2)
    expect(wrapper.findAll('.my-expand')).toHaveLength(0)
    expect(wrapper.findAll('.qt-expand svg')).toHaveLength(5)
    const withoutSlots = wrapper.html()

    // The markup is the one of a table that never had the slots.
    const plain = mount(QueryTable as unknown as Component, {
      props: {
        columns,
        rows: makeRows(),
        totalRows: 5,
        query: makeQuery(),
        rowKey: 'id',
        sortable: true,
        hasSubtable: true
      },
      attachTo: document.body
    })
    expect(withoutSlots).toBe(plain.html())
    plain.unmount()

    on.value = true
    await nextTick()
    await nextTick()
    expect(wrapper.findAll('.my-sort')).toHaveLength(2)
    expect(wrapper.findAll('.my-expand')).toHaveLength(5)
  })

  it('CellCopy and CellPreview draw the icons of their table; outside one they draw their own', () => {
    const m = mountIt(
      { labels: { copyValue: (value: string) => `Kopyala ${value}` } },
      {
        slots: {
          'cell-name': ({ row }: { row: Row }) => [
            h(CellCopy, { value: row.name }),
            h(CellPreview, { text: row.name })
          ],
          'icon-copy': icon('copy'),
          'icon-preview': icon('preview')
        }
      }
    )
    const cell = m.wrapper.find('tbody > tr[data-row-index="0"]')
    const copy = cell.find('.qt-cell-copy-button')
    expect(copy.find('svg').exists()).toBe(false)
    expect(copy.find('.my-copy').exists()).toBe(true)
    expect(copy.attributes('aria-label')).toBe('Kopyala Charlie')
    expect(cell.find('.qt-cell-preview-button .my-preview').exists()).toBe(true)

    wrapper = mount(CellCopy as Component, { props: { value: 'abc' } })
    expect(wrapper.find('svg.qt-cell-icon').exists()).toBe(true)
  })

  it('DataTable passes the slots on', () => {
    wrapper = mount(DataTable as unknown as Component, {
      props: {
        // `rowKey` names a column (C-124).
        columns: [{ field: 'id', title: 'ID', type: 'integer' }, ...columns],
        rows: makeRows(),
        rowKey: 'id',
        sortable: true
      },
      slots: {
        'icon-sort': ({ direction }: { direction: SortDirection | false }) =>
          h('i', { class: 'my-sort', 'data-direction': String(direction) })
      },
      attachTo: document.body
    })
    expect(wrapper.find('.qt-sort .my-sort').exists()).toBe(true)
    expect(wrapper.find('.qt-sort-icon').exists()).toBe(false)
  })
})
