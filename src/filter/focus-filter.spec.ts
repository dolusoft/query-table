import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

import {
  makeColumns,
  makeQuery,
  makeRows,
  mountTable,
  type Mounted
} from '../../tests/support/mount-table'
import type { Column, FilterRule } from '../contract'
import QueryTable from '../index'

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

const focusFilter = (m: Mounted, field: string) =>
  (m.wrapper.vm as unknown as { focusFilter(f: string): boolean }).focusFilter(
    field
  )

const withActive: Column[] = [
  ...makeColumns(),
  { field: 'active', title: 'Active', type: 'bool' }
]

describe('C-54 focusFilter', () => {
  it.each(['id', 'name', 'joined', 'active'])(
    'focuses the filter input of %s and returns true',
    field => {
      const m = mountIt({ filterable: true, columns: withActive })
      expect(focusFilter(m, field)).toBe(true)
      const active = document.activeElement!
      expect(active.classList.contains('qt-filter-input')).toBe(true)
      expect(active.closest('th')!.getAttribute('data-field')).toBe(field)
    }
  )

  it('returns false and moves no focus when there is no filter for the field', async () => {
    const m = mountIt({
      filterable: true,
      columns: [
        { field: 'id', title: 'ID', type: 'number', filterable: false },
        { field: 'name', title: 'Name', hide: true },
        { field: 'age', title: 'Age', type: 'number' }
      ]
    })
    document.body.focus()
    const before = document.activeElement
    expect(focusFilter(m, 'id')).toBe(false)
    expect(focusFilter(m, 'name')).toBe(false)
    expect(focusFilter(m, 'nope')).toBe(false)
    expect(document.activeElement).toBe(before)
    await m.wrapper.setProps({ filterable: false })
    expect(focusFilter(m, 'age')).toBe(false)
  })

  it('returns false for a disabled bool select (several rules)', () => {
    const filters: FilterRule[] = [
      { field: 'active', condition: 'Equal', value: true },
      { field: 'active', condition: 'Equal', value: false }
    ]
    const m = mountIt({
      filterable: true,
      columns: withActive,
      query: makeQuery({ filters })
    })
    expect(focusFilter(m, 'active')).toBe(false)
  })

  it('focuses the first focusable element of the filter-datetime slot, not the menu trigger', () => {
    const m = mountIt(
      { filterable: true },
      {
        slots: {
          'filter-datetime': () => h('input', { class: 'picker' }),
          'filter-menu': (menu: { trigger: object }) => h(menu.trigger)
        }
      }
    )
    expect(focusFilter(m, 'joined')).toBe(true)
    expect(document.activeElement!.classList.contains('picker')).toBe(true)
  })

  it('returns false when the filter-datetime slot draws nothing focusable', () => {
    const m = mountIt(
      { filterable: true },
      {
        slots: {
          'filter-datetime': () => h('span', 'no input'),
          'filter-menu': (menu: { trigger: object }) => h(menu.trigger)
        }
      }
    )
    expect(focusFilter(m, 'joined')).toBe(false)
  })

  it('does not search a table nested in a slot', () => {
    const m = mountIt(
      { hasSubtable: true, rowKey: 'id', rows: makeRows().slice(0, 1) },
      {
        slots: {
          subtable: () =>
            h(QueryTable as never, {
              query: makeQuery(),
              columns: makeColumns(),
              rows: makeRows(),
              filterable: true
            })
        }
      }
    )
    ;(m.wrapper.vm as unknown as { expandAll(): void }).expandAll()
    return m.wrapper.vm.$nextTick().then(() => {
      expect(m.wrapper.findAll('.qt-filter-input').length).toBeGreaterThan(0)
      expect(focusFilter(m, 'name')).toBe(false)
    })
  })
})
