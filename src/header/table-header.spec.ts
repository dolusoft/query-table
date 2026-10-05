import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

import {
  makeColumns,
  makeQuery,
  makeRows,
  mountTable,
  type Mounted
} from '../../tests/support/mount-table'
import type { FilterMenuSlotProps } from '../contract'

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

describe('C-31 No styling', () => {
  it('writes no inline style except width on a header cell that defines it', () => {
    const m = mountIt({
      sortable: true,
      filterable: true,
      hasSubtable: true,
      hasRightPanel: true,
      columns: [
        { field: 'id', title: 'ID', width: '80px' },
        { field: 'name', title: 'Name' },
        { field: 'joined', title: 'Joined', type: 'date' }
      ],
      footerRows: [{ cells: [{ field: 'id', text: 1 }] }]
    })
    const styled = (m.wrapper.element as Element).querySelectorAll('[style]')
    expect(styled).toHaveLength(1)
    expect(styled[0].tagName).toBe('TH')
    expect(styled[0].getAttribute('data-field')).toBe('id')
    expect((styled[0] as HTMLElement).style.width).toBe('80px')
  })

  it('declares no styling props', () => {
    const props = Object.keys(
      (mountIt().wrapper.vm.$.type as { props: Record<string, unknown> }).props
    )
    expect(
      props.filter(name =>
        /^(class|style|skin|height|sticky|offset|width|theme)/i.test(name)
      )
    ).toEqual([])
  })
})

describe('C-32 State attributes', () => {
  it('sets the root attributes from the state', async () => {
    const m = mountIt({ rows: [] })
    const root = () => m.wrapper.find('.bh-datatable')
    expect(root().attributes('data-empty')).toBe('')
    await m.wrapper.setProps({
      rows: makeRows(),
      query: makeQuery({
        sort: { field: 'name', direction: 'asc' },
        filters: [{ field: 'name', condition: 'Contains', value: 'a' }]
      })
    })
    expect(root().attributes('data-empty')).toBeUndefined()
  })

  it('sets the header cell attributes and aria-sort', () => {
    const m = mountIt({
      sortable: true,
      filterable: true,
      query: makeQuery({
        sort: { field: 'age', direction: 'desc' },
        filters: [{ field: 'name', condition: 'Contains', value: 'a' }]
      })
    })
    const name = m.wrapper.find('th[data-field="name"]')
    const age = m.wrapper.find('th[data-field="age"]')
    expect(name.attributes()).toMatchObject({
      'data-sortable': '',
      'data-filtered': ''
    })
    expect(name.attributes('data-sort')).toBeUndefined()
    expect(name.attributes('aria-sort')).toBeUndefined()
    expect(age.attributes('data-sort')).toBe('desc')
    expect(age.attributes('aria-sort')).toBe('descending')
    expect(age.attributes('data-filtered')).toBeUndefined()
  })

  it('maps asc to aria-sort ascending', () => {
    const m = mountIt({
      sortable: true,
      query: makeQuery({ sort: { field: 'age', direction: 'asc' } })
    })
    expect(m.wrapper.find('th[data-field="age"]').attributes('aria-sort')).toBe(
      'ascending'
    )
  })

  it('sets data-field on body and footer cells and data-row-index on rows', () => {
    const m = mountIt({
      footerRows: [{ cells: [{ field: 'age', text: 9 }] }]
    })
    const cell = m.wrapper.find(
      'tbody tr[data-row-index="0"] td[data-field="age"]'
    )
    expect(cell.text()).toBe('30')
    expect(m.wrapper.find('tfoot td[data-field="age"]').text()).toBe('9')
    expect(m.wrapper.findAll('tbody tr[data-row-index]')).toHaveLength(5)
  })
})

describe('C-34 Filter menu slot', () => {
  it('draws no popover or tooltip and no filter button without the slot', () => {
    const m = mountIt({ filterable: true })
    expect(m.wrapper.find('.bh-filter-button').exists()).toBe(false)
    expect(
      m.wrapper.find('[role="tooltip"], [data-popper-placement]').exists()
    ).toBe(false)
  })

  it('renders the slot right after the filter input, as its sibling', () => {
    const m = mountIt(
      { filterable: true },
      {
        slots: {
          'filter-menu': (menu: FilterMenuSlotProps) => h(menu.trigger)
        }
      }
    )
    const input = m.wrapper.find('th[data-field="name"] .bh-filter-input')
    const button = input.element.nextElementSibling
    expect(button?.classList.contains('bh-filter-button')).toBe(true)
    expect(button?.parentElement).toBe(input.element.parentElement)
    // bool columns have no menu
    expect(m.wrapper.findAll('.bh-filter-button')).toHaveLength(4)
  })

  it('gives the slot the column, the rules, the conditions and a trigger that takes attributes', () => {
    const seen: FilterMenuSlotProps[] = []
    const m = mountIt(
      {
        filterable: true,
        sortable: true,
        query: makeQuery({
          sort: { field: 'name', direction: 'asc' },
          filters: [{ field: 'name', condition: 'StartsWith', value: 'a' }]
        })
      },
      {
        slots: {
          'filter-menu': (menu: FilterMenuSlotProps) => {
            seen.push(menu)
            return h(menu.trigger, { 'data-extra': 'yes', class: 'extra' })
          }
        }
      }
    )
    const name = seen.find(menu => menu.column.field === 'name')!
    expect(name.rules).toEqual([
      { field: 'name', condition: 'StartsWith', value: 'a' }
    ])
    expect(name.condition).toBe('StartsWith')
    expect(name.sortDirection).toBe('asc')
    expect(name.sortable).toBe(true)
    expect(name.conditions.length).toBeGreaterThan(3)
    const button = m.wrapper.find('th[data-field="name"] .bh-filter-button')
    expect(button.attributes('data-extra')).toBe('yes')
    expect(button.classes()).toContain('extra')
    expect(button.attributes('data-filtered')).toBe('')
    expect(
      m.wrapper.findAll('.bh-filter-button button, button button')
    ).toHaveLength(0)
  })

  it('keeps the trigger label in step with the column title', async () => {
    const m = mountIt(
      { filterable: true },
      {
        slots: {
          'filter-menu': (menu: FilterMenuSlotProps) => h(menu.trigger)
        }
      }
    )
    const label = () =>
      m.wrapper
        .find('th[data-field="name"] .bh-filter-button')
        .attributes('aria-label')
    expect(label()).toBe('Filter options for Name')
    await m.wrapper.setProps({
      columns: makeColumns().map(column =>
        column.field === 'name' ? { ...column, title: 'Isim' } : column
      )
    })
    expect(label()).toBe('Filter options for Isim')
    expect(
      m.wrapper
        .find('th[data-field="name"] .bh-filter-input')
        .attributes('aria-label')
    ).toBe('Filter Isim')
  })

  it('keeps the same trigger component across renders, so a wrapper does not remount it', async () => {
    const seen: FilterMenuSlotProps[] = []
    const m = mountIt(
      { filterable: true },
      {
        slots: {
          'filter-menu': (menu: FilterMenuSlotProps) => {
            seen.push(menu)
            return h(menu.trigger)
          }
        }
      }
    )
    const first = seen.find(menu => menu.column.field === 'name')!.trigger
    await m.setQuery(makeQuery({ page: 2 }))
    const last = [...seen].reverse().find(menu => menu.column.field === 'name')!
    expect(last.trigger).toBe(first)
  })
})
