import { h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  Column,
  FilterDatetimeSlotProps,
  FilterMenuSlotProps,
  FilterRule,
  PaginationSlotProps
} from '../src/contract'
import {
  flush,
  makeColumns,
  makeQuery,
  mountTable,
  reasons,
  type Mounted
} from './helpers'

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
  vi.useRealTimers()
})

const input = (m: Mounted, field: string) =>
  m.wrapper.find(`th[data-field="${field}"] .bh-filter-input`)

const type = async (m: Mounted, field: string, text: string) =>
  input(m, field).setValue(text)

const rule = (
  field: string,
  condition: FilterRule['condition'],
  value: FilterRule['value']
): FilterRule => ({ field, condition, value })

// The clear-all button lives in the first utility column.
const base = { filterable: true, hasRightPanel: true }

describe('C-09 Typing applies a filter after the debounce', () => {
  it('applies after filterDebounce ms with reason filter and page 1', async () => {
    const m = mountIt({
      ...base,
      filterDebounce: 250,
      query: makeQuery({ page: 4 }),
      totalRows: 100
    })
    await type(m, 'name', 'ali')
    vi.advanceTimersByTime(249)
    expect(m.events).toEqual([])
    vi.advanceTimersByTime(1)
    expect(reasons(m.events)).toEqual(['filter'])
    expect(m.events[0][0]).toEqual(
      makeQuery({
        page: 1,
        filters: [rule('name', 'Contains', 'ali')]
      })
    )
  })

  it('makes one update for several keystrokes', async () => {
    const m = mountIt(base)
    await type(m, 'name', 'a')
    vi.advanceTimersByTime(60)
    await type(m, 'name', 'al')
    vi.advanceTimersByTime(60)
    await type(m, 'name', 'ali')
    vi.advanceTimersByTime(100)
    expect(m.events).toHaveLength(1)
    expect(m.events[0][0].filters).toEqual([rule('name', 'Contains', 'ali')])
  })

  it('replaces only the rules of that column', async () => {
    const m = mountIt({
      ...base,
      query: makeQuery({ filters: [rule('name', 'Contains', 'ali')] })
    })
    await type(m, 'name', 'bo')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([rule('name', 'Contains', 'bo')])
  })
})

describe('C-10 Other rules pass through', () => {
  it('keeps rules of other, hidden and unknown fields as they are', async () => {
    const other = rule('age', 'GreaterThan', 20)
    const hidden = rule('secret', 'Equal', 'x')
    const unknown = rule('ghost', 'NotEqual', 'y')
    const columns: Column[] = [...makeColumns(), { field: 'secret', hide: true }]
    const m = mountIt({
      ...base,
      columns,
      query: makeQuery({ filters: [other, hidden, unknown] })
    })
    await type(m, 'name', 'ali')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([
      other,
      hidden,
      unknown,
      rule('name', 'Contains', 'ali')
    ])
  })

  it('keeps the position of the rules it replaces', async () => {
    const m = mountIt({
      ...base,
      query: makeQuery({
        filters: [rule('name', 'Contains', 'a'), rule('age', 'Equal', 3)]
      })
    })
    await type(m, 'name', 'b')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([
      rule('name', 'Contains', 'b'),
      rule('age', 'Equal', 3)
    ])
  })
})

describe('C-11 Emptying an input applies at once', () => {
  it('does not wait for the debounce and removes the rules of that column', async () => {
    const m = mountIt({
      ...base,
      query: makeQuery({
        page: 3,
        filters: [rule('name', 'Contains', 'ali'), rule('age', 'Equal', 3)]
      }),
      totalRows: 100
    })
    await type(m, 'name', '')
    expect(reasons(m.events)).toEqual(['filter'])
    expect(m.events[0][0].filters).toEqual([rule('age', 'Equal', 3)])
    expect(m.events[0][0].page).toBe(1)
  })
})

describe('C-12 Enter and zero debounce', () => {
  it('applies the input now on Enter and nothing again when the timer would fire', async () => {
    const m = mountIt(base)
    await type(m, 'name', 'ali')
    await input(m, 'name').trigger('keydown.enter')
    expect(reasons(m.events)).toEqual(['filter'])
    vi.advanceTimersByTime(500)
    expect(m.events).toHaveLength(1)
  })

  it('applies every keystroke synchronously with filterDebounce 0', async () => {
    const m = mountIt({ ...base, filterDebounce: 0 })
    const field = input(m, 'name')
    field.element.dispatchEvent(new Event('input'))
    ;(field.element as HTMLInputElement).value = 'a'
    field.element.dispatchEvent(new Event('input'))
    expect(m.events).toHaveLength(1)
    ;(field.element as HTMLInputElement).value = 'ab'
    field.element.dispatchEvent(new Event('input'))
    expect(m.events).toHaveLength(2)
    expect(m.events[1][0].filters).toEqual([rule('name', 'Contains', 'ab')])
  })
})

describe('C-13 flushPendingFilters', () => {
  it('applies every pending filter before the call returns', async () => {
    const m = mountIt({
      ...base,
      filterDebounce: 1000,
      columns: [...makeColumns()]
    })
    await type(m, 'name', 'ali')
    await type(m, 'age', '25')
    expect(m.events).toEqual([])
    ;(m.wrapper.vm as unknown as { flushPendingFilters: () => void }).flushPendingFilters()
    expect(reasons(m.events)).toEqual(['filter', 'filter'])
    expect(m.events[1][0].filters).toEqual([
      rule('name', 'Contains', 'ali'),
      rule('age', 'Equal', 25)
    ])
    vi.advanceTimersByTime(5000)
    expect(m.events).toHaveLength(2)
  })

  it('does nothing when nothing is pending', () => {
    const m = mountIt(base)
    ;(m.wrapper.vm as unknown as { flushPendingFilters: () => void }).flushPendingFilters()
    expect(m.events).toEqual([])
  })
})

describe('C-14 Pending filters go first', () => {
  const withPagination = () => {
    const box: { slot: PaginationSlotProps | null } = { slot: null }
    const m = mountIt(
      {
        ...base,
        sortable: true,
        filterDebounce: 1000,
        totalRows: 100,
        query: makeQuery({ page: 3 })
      },
      {
        slots: {
          pagination: ((slot: PaginationSlotProps) => {
            box.slot = slot
            return h('i')
          }) as never
        }
      }
    )
    return { m, box }
  }

  it('applies a pending filter before a page change and builds on it', async () => {
    const { m, box } = withPagination()
    await type(m, 'name', 'ali')
    box.slot!.nextPage()
    expect(reasons(m.events)).toEqual(['filter', 'page'])
    expect(m.events[1][0].filters).toEqual(m.events[0][0].filters)
    expect(m.events[0][0].page).toBe(1)
    expect(m.events[1][0].page).toBe(2)
  })

  it('applies a pending filter before a sort', async () => {
    const { m } = withPagination()
    await type(m, 'name', 'ali')
    await m.wrapper.find('th[data-field="age"] .bh-sort').trigger('click')
    expect(reasons(m.events)).toEqual(['filter', 'sort'])
    expect(m.events[1][0].filters).toEqual([rule('name', 'Contains', 'ali')])
    expect(m.events[1][0].sort).toEqual({ field: 'age', direction: 'asc' })
  })

  it('applies a pending filter before a page size change and before clear all', async () => {
    const { m, box } = withPagination()
    await type(m, 'name', 'ali')
    box.slot!.setPageSize(20)
    expect(reasons(m.events)).toEqual(['filter', 'pageSize'])
    expect(m.events[1][0].filters).toEqual([rule('name', 'Contains', 'ali')])

    await type(m, 'age', '5')
    await m.wrapper.find('.bh-clear-all-button').trigger('click')
    await flush()
    expect(reasons(m.events).slice(2)).toContain('reset')
  })
})

describe('C-15 Operator shortcuts', () => {
  it.each([
    ['*foo*', [rule('name', 'Contains', 'foo')]],
    ['foo*', [rule('name', 'StartsWith', 'foo')]],
    ['*foo', [rule('name', 'EndsWith', 'foo')]],
    ['!foo', [rule('name', 'NotEqual', 'foo')]],
    ['!*foo*', [rule('name', 'NotContains', 'foo')]],
    ['!foo*', [rule('name', 'NotContains', 'foo')]],
    ['!*foo', [rule('name', 'NotContains', 'foo')]],
    ['a,b', [rule('name', 'Contains', 'a'), rule('name', 'Contains', 'b')]]
  ])('%s becomes clean rules', async (text, expected) => {
    const m = mountIt(base)
    await type(m, 'name', text)
    vi.advanceTimersByTime(100)
    expect(m.events).toHaveLength(1)
    expect(m.events[0][0].filters).toEqual(expected)
    expect(JSON.stringify(m.events[0][0])).not.toMatch(/[*!]/)
  })

  it('never rewrites the text the user typed, not even after the echo', async () => {
    const m = mountIt(base)
    await type(m, 'name', '*foo*')
    vi.advanceTimersByTime(100)
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('*foo*')
    expect(m.query().filters).toEqual([rule('name', 'Contains', 'foo')])
  })

  it.each(['*', '!', '!*', ',', ' '])('%j alone makes no rule', async text => {
    const m = mountIt(base)
    await type(m, 'name', text)
    vi.advanceTimersByTime(100)
    expect(m.events).toEqual([])
  })

  it('uses the condition picked in the menu for a segment without an operator', async () => {
    const menus: Record<string, FilterMenuSlotProps> = {}
    const m = mountIt(base, {
      slots: {
        'filter-menu': ((menu: FilterMenuSlotProps) => {
          menus[menu.column.field] = menu
          return h(menu.trigger)
        }) as never
      }
    })
    await type(m, 'name', 'foo,*bar')
    vi.advanceTimersByTime(100)
    menus.name.setCondition('StartsWith')
    await flush()
    expect(m.query().filters).toEqual([
      rule('name', 'StartsWith', 'foo'),
      rule('name', 'EndsWith', 'bar')
    ])
  })
})

describe('C-16 Value types', () => {
  it('gives number values for number and integer columns, and Equal by default', async () => {
    const m = mountIt({
      ...base,
      columns: [
        { field: 'age', type: 'number' },
        { field: 'count', type: 'integer' }
      ]
    })
    await type(m, 'age', '30.5')
    vi.advanceTimersByTime(100)
    await type(m, 'count', '7')
    vi.advanceTimersByTime(100)
    await flush()
    expect(m.query().filters).toEqual([
      rule('age', 'Equal', 30.5),
      rule('count', 'Equal', 7)
    ])
  })

  it('gives boolean values for bool columns', async () => {
    const m = mountIt({ ...base, columns: [{ field: 'active', type: 'bool' }] })
    const select = m.wrapper.find('th[data-field="active"] select')
    await select.setValue('true')
    expect(m.query().filters).toEqual([rule('active', 'Equal', true)])
    await select.setValue('false')
    expect(m.query().filters).toEqual([rule('active', 'Equal', false)])
    await select.setValue('')
    expect(m.query().filters).toEqual([])
  })

  it('gives string values for date and datetime columns', async () => {
    const m = mountIt({
      ...base,
      columns: [
        { field: 'joined', type: 'date' },
        { field: 'seen', type: 'datetime' }
      ]
    })
    await type(m, 'joined', '2024-01-10')
    vi.advanceTimersByTime(100)
    await flush()
    expect(m.query().filters).toEqual([rule('joined', 'Equal', '2024-01-10')])
    expect(m.wrapper.find('th[data-field="joined"] input').attributes('type')).toBe(
      'date'
    )
  })

  it('makes no rule for a text that is not a number', async () => {
    const m = mountIt({ ...base, columns: [{ field: 'age', type: 'number' }] })
    // a number input rejects such text itself; set the property directly
    const field = input(m, 'age').element as HTMLInputElement
    field.type = 'text'
    field.value = 'abc'
    field.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(100)
    expect(m.events).toEqual([])
  })
})

describe('C-17 Several rules for one field', () => {
  it('makes one rule per segment, each with its own condition', async () => {
    const m = mountIt(base)
    await type(m, 'name', '!*youtube*,vimeo*,!ads')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([
      rule('name', 'NotContains', 'youtube'),
      rule('name', 'StartsWith', 'vimeo'),
      rule('name', 'NotEqual', 'ads')
    ])
  })

  it('shows how many rules the input stands for next to the condition', async () => {
    const m = mountIt(base)
    await type(m, 'name', 'a,b')
    expect(m.wrapper.find('.bh-filter-condition').text()).toBe('Contains (2)')
  })
})

describe('C-18 The input follows outside changes', () => {
  it('shows the new rules in the input and the condition label', async () => {
    const m = mountIt(base)
    await m.setQuery(
      makeQuery({
        filters: [
          rule('name', 'StartsWith', 'foo'),
          rule('age', 'GreaterThan', 20)
        ]
      })
    )
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('foo*')
    expect((input(m, 'age').element as HTMLInputElement).value).toBe('20')
    expect(m.wrapper.find('th[data-field="name"] .bh-filter-condition').text()).toBe(
      'Starts With'
    )
    expect(m.wrapper.find('th[data-field="age"] .bh-filter-condition').text()).toBe(
      'Greater Than (>)'
    )
  })

  it('writes a plain Contains rule as plain text', async () => {
    const m = mountIt(base)
    await m.setQuery(makeQuery({ filters: [rule('name', 'Contains', 'bob')] }))
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('bob')
  })

  it('removing the rules from outside empties the input and removes the label', async () => {
    const m = mountIt({
      ...base,
      query: makeQuery({ filters: [rule('name', 'Contains', 'bob')] })
    })
    await flush()
    expect(m.wrapper.find('.bh-filter-condition').exists()).toBe(true)
    await m.setQuery(makeQuery())
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('')
    expect(m.wrapper.find('.bh-filter-condition').exists()).toBe(false)
  })

  it('leaves the other inputs alone when one column changes from outside', async () => {
    const m = mountIt(base)
    await type(m, 'age', '2')
    await m.setQuery(makeQuery({ filters: [rule('name', 'Contains', 'x')] }))
    await flush()
    expect((input(m, 'age').element as HTMLInputElement).value).toBe('2')
  })
})

describe('C-20 Picking a condition', () => {
  const menus: Record<string, FilterMenuSlotProps> = {}
  const slots = {
    'filter-menu': ((menu: FilterMenuSlotProps) => {
      menus[menu.column.field] = menu
      return h(menu.trigger)
    }) as never
  }

  it('applies the filter when the input has a value', async () => {
    const m = mountIt(base, { slots })
    await type(m, 'name', 'foo')
    vi.advanceTimersByTime(100)
    menus.name.setCondition('NotContains')
    await flush()
    expect(m.query().filters).toEqual([rule('name', 'NotContains', 'foo')])
    expect(menus.name.condition).toBe('NotContains')
  })

  it('only waits for a value when the input is empty', async () => {
    const m = mountIt(base, { slots })
    menus.name.setCondition('StartsWith')
    await flush()
    expect(m.events).toEqual([])
    expect(m.wrapper.find('.bh-filter-condition').text()).toBe('Starts With')
    await type(m, 'name', 'foo')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([rule('name', 'StartsWith', 'foo')])
  })

  it('applies IsNull and IsNotNull at once with a null value and disables the input', async () => {
    const m = mountIt(base, { slots })
    menus.name.setCondition('IsNull')
    await flush()
    expect(m.events[0][0].filters).toEqual([rule('name', 'IsNull', null)])
    expect(input(m, 'name').attributes('disabled')).toBeDefined()
    menus.name.setCondition('IsNotNull')
    await flush()
    expect(m.query().filters).toEqual([rule('name', 'IsNotNull', null)])
    expect(input(m, 'name').attributes('disabled')).toBeDefined()
  })

  it('clears the filter with null', async () => {
    const m = mountIt(
      { ...base, query: makeQuery({ filters: [rule('name', 'Contains', 'a')] }) },
      { slots }
    )
    menus.name.setCondition(null)
    await flush()
    expect(m.query().filters).toEqual([])
    expect(input(m, 'name').attributes('disabled')).toBeUndefined()
  })

  it('lists no empty "no filter" condition and ends with the emptiness pair', () => {
    mountIt(base, { slots })
    const values = menus.name.conditions.map(option => option.value)
    expect(values).not.toContain('')
    expect(values.slice(-2)).toEqual(['IsNull', 'IsNotNull'])
  })
})

describe('C-21 Clearing one column', () => {
  it('removes the rules of that column only and leaves the sort alone', async () => {
    const menus: Record<string, FilterMenuSlotProps> = {}
    const m = mountIt(
      {
        ...base,
        sortable: true,
        totalRows: 100,
        query: makeQuery({
          page: 3,
          sort: { field: 'age', direction: 'desc' },
          filters: [rule('name', 'Contains', 'a'), rule('age', 'Equal', 3)]
        })
      },
      {
        slots: {
          'filter-menu': ((menu: FilterMenuSlotProps) => {
            menus[menu.column.field] = menu
            return h(menu.trigger)
          }) as never
        }
      }
    )
    menus.name.clear()
    await flush()
    expect(reasons(m.events)).toEqual(['filter'])
    expect(m.events[0][0]).toEqual(
      makeQuery({
        page: 1,
        sort: { field: 'age', direction: 'desc' },
        filters: [rule('age', 'Equal', 3)]
      })
    )
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('')
  })
})

describe('C-22 Clearing all filters', () => {
  const clearAll = (m: Mounted) => m.wrapper.find('.bh-clear-all-button')

  it('removes every rule and nothing else, with reason reset', async () => {
    const m = mountIt({
      ...base,
      sortable: true,
      totalRows: 100,
      query: makeQuery({
        page: 4,
        pageSize: 20,
        sort: { field: 'name', direction: 'asc' },
        filters: [rule('name', 'Contains', 'a'), rule('age', 'Equal', 3)]
      })
    })
    await clearAll(m).trigger('click')
    expect(reasons(m.events)).toEqual(['reset'])
    expect(m.events[0][0]).toEqual(
      makeQuery({
        page: 1,
        pageSize: 20,
        sort: { field: 'name', direction: 'asc' }
      })
    )
  })

  it('is disabled while there is no filter and nothing typed', async () => {
    const m = mountIt(base)
    expect(clearAll(m).attributes('disabled')).toBeDefined()
    await type(m, 'name', 'a')
    expect(clearAll(m).attributes('disabled')).toBeUndefined()
    await type(m, 'name', '')
    expect(clearAll(m).attributes('disabled')).toBeDefined()
  })

  it('empties what was typed and never applied', async () => {
    const m = mountIt({ ...base, filterDebounce: 1000 })
    await type(m, 'name', 'abc')
    await clearAll(m).trigger('click')
    vi.advanceTimersByTime(5000)
    expect(m.events).toEqual([])
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('')
  })

  it('is enabled with rules that came from outside', async () => {
    const m = mountIt({
      ...base,
      query: makeQuery({ filters: [rule('ghost', 'Equal', 1)] })
    })
    expect(clearAll(m).attributes('disabled')).toBeUndefined()
  })
})

describe('C-35 Date filter slot', () => {
  it('replaces the date input and applies updateValue like typing', async () => {
    const box: { slot: FilterDatetimeSlotProps | null } = { slot: null }
    const m = mountIt(
      {
        ...base,
        columns: [{ field: 'joined', title: 'Joined', type: 'date' }]
      },
      {
        slots: {
          'filter-datetime': ((slot: FilterDatetimeSlotProps) => {
            box.slot = slot
            return h('span', { class: 'custom-date' }, String(slot.value))
          }) as never
        }
      }
    )
    expect(m.wrapper.find('.custom-date').exists()).toBe(true)
    expect(m.wrapper.find('input[type="date"]').exists()).toBe(false)
    box.slot!.updateValue('2024-05-01')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([rule('joined', 'Equal', '2024-05-01')])
    await flush()
    expect(m.wrapper.find('.custom-date').text()).toBe('2024-05-01')
  })
})
