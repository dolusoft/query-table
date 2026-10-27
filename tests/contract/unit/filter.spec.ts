import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import { parseFilterInput } from '@dolusoft/query-table'
import type {
  Column,
  FilterCondition,
  FilterDatetimeSlotProps,
  FilterMenuSlotProps,
  FilterValue,
  PaginationSlotProps,
  ToolbarSlotProps,
  ValueCondition,
  ValueFilterRule
} from '@dolusoft/query-table'

import {
  flush,
  makeColumns,
  makeQuery,
  mountTable,
  reasons,
  type Mounted
} from '../../support/mount-table'

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
  m.wrapper.find(`th[data-field="${field}"] .qt-filter-input`)

const type = async (m: Mounted, field: string, text: string) =>
  input(m, field).setValue(text)

const rule = (
  field: string,
  condition: ValueCondition,
  value: FilterValue
): ValueFilterRule => ({ field, condition, value })

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
    const columns: Column[] = [
      ...makeColumns(),
      { field: 'secret', hide: true }
    ]
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

  it('applies every keystroke synchronously with filterDebounce 0', () => {
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
    ;(
      m.wrapper.vm as unknown as { flushPendingFilters: () => void }
    ).flushPendingFilters()
    // One update for every pending input: one call is one action (C-04).
    expect(reasons(m.events)).toEqual(['filter'])
    expect(m.events[0][0].filters).toEqual([
      rule('name', 'Contains', 'ali'),
      rule('age', 'Equal', 25)
    ])
    vi.advanceTimersByTime(5000)
    expect(m.events).toHaveLength(1)
  })

  it('does nothing when nothing is pending', () => {
    const m = mountIt(base)
    ;(
      m.wrapper.vm as unknown as { flushPendingFilters: () => void }
    ).flushPendingFilters()
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
          pagination: (slot: PaginationSlotProps) => {
            box.slot = slot
            return h('i')
          }
        }
      }
    )
    return { m, box }
  }

  it.each([
    ['nextPage', (slot: PaginationSlotProps) => slot.nextPage()],
    ['previousPage', (slot: PaginationSlotProps) => slot.previousPage()],
    ['setPage', (slot: PaginationSlotProps) => slot.setPage(7)]
  ])(
    'drops %s when flushing a pending filter changed the filters: one filter update, page 1',
    async (_name, act) => {
      const { m, box } = withPagination()
      await type(m, 'name', 'ali')
      act(box.slot!)
      expect(reasons(m.events)).toEqual(['filter'])
      expect(m.events[0][0].filters).toEqual([rule('name', 'Contains', 'ali')])
      expect(m.events[0][0].page).toBe(1)
      vi.advanceTimersByTime(5000)
      expect(m.events).toHaveLength(1)
    }
  )

  it('still changes the page when the pending text changes no filter', async () => {
    const slot: { next?: () => void } = {}
    const withSlot = mountIt(
      {
        ...base,
        filterDebounce: 1000,
        totalRows: 100,
        query: makeQuery({
          page: 3,
          filters: [rule('name', 'Contains', 'ali')]
        })
      },
      {
        slots: {
          pagination: (p: PaginationSlotProps) => {
            slot.next = p.nextPage
            return h('i')
          }
        }
      }
    )
    // `ali,` stands for the same rule as `ali`: flushing it changes nothing.
    await type(withSlot, 'name', 'ali,')
    slot.next!()
    expect(reasons(withSlot.events)).toEqual(['page'])
    expect(withSlot.events[0][0].page).toBe(4)
  })

  it('applies several pending inputs as one filter update before a sort', async () => {
    const { m } = withPagination()
    await type(m, 'name', 'ali')
    await type(m, 'age', '25')
    await m.wrapper.find('th[data-field="id"] .qt-sort').trigger('click')
    expect(reasons(m.events)).toEqual(['filter', 'sort'])
    const both = [rule('name', 'Contains', 'ali'), rule('age', 'Equal', 25)]
    expect(m.events[0][0].filters).toEqual(both)
    expect(m.events[1][0].filters).toEqual(both)
    expect(m.events[1][0].sort).toEqual({ field: 'id', direction: 'asc' })
  })

  it('drops a page action after several pending inputs: one filter update, page 1', async () => {
    const { m, box } = withPagination()
    await type(m, 'name', 'ali')
    await type(m, 'age', '25')
    box.slot!.nextPage()
    expect(reasons(m.events)).toEqual(['filter'])
    expect(m.events[0][0].page).toBe(1)
    expect(m.events[0][0].filters).toEqual([
      rule('name', 'Contains', 'ali'),
      rule('age', 'Equal', 25)
    ])
  })

  it('applies a pending filter before a sort', async () => {
    const { m } = withPagination()
    await type(m, 'name', 'ali')
    await m.wrapper.find('th[data-field="age"] .qt-sort').trigger('click')
    expect(reasons(m.events)).toEqual(['filter', 'sort'])
    expect(m.events[1][0].filters).toEqual([rule('name', 'Contains', 'ali')])
    expect(m.events[1][0].sort).toEqual({ field: 'age', direction: 'asc' })
  })

  it('applies a pending filter before a page size change and builds on it', async () => {
    const { m, box } = withPagination()
    await type(m, 'name', 'ali')
    box.slot!.setPageSize(20)
    expect(reasons(m.events)).toEqual(['filter', 'pageSize'])
    expect(m.events[1][0].filters).toEqual([rule('name', 'Contains', 'ali')])
    expect(m.events[1][0].pageSize).toBe(20)
    expect(m.events[1][0].page).toBe(1)
  })

  it('does not apply a pending filter before clear all: it discards the typed text', async () => {
    const { m, box } = withPagination()
    await type(m, 'name', 'ali')
    box.slot!.setPageSize(20)
    expect(reasons(m.events)).toEqual(['filter', 'pageSize'])

    await type(m, 'age', '5')
    await m.wrapper.find('.qt-clear-all-button').trigger('click')
    await flush()
    // the full sequence: no `filter` for the pending `age` text
    expect(reasons(m.events)).toEqual(['filter', 'pageSize', 'reset'])
    expect(m.events[2][0]).toEqual(makeQuery({ page: 1, pageSize: 20 }))
    // the pending text is gone: from the input and from the debounce timer
    expect((input(m, 'age').element as HTMLInputElement).value).toBe('')
    vi.advanceTimersByTime(5000)
    expect(reasons(m.events)).toEqual(['filter', 'pageSize', 'reset'])
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
        'filter-menu': (menu: FilterMenuSlotProps) => {
          menus[menu.column.field] = menu
          return h(menu.trigger)
        }
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
    expect(
      m.wrapper.find('th[data-field="joined"] input').attributes('type')
    ).toBe('date')
  })

  it('makes no rule for a decimal in an integer column, and removes the rule it had', async () => {
    const m = mountIt({
      ...base,
      columns: [{ field: 'count', type: 'integer' }]
    })
    await type(m, 'count', '7')
    vi.advanceTimersByTime(100)
    await flush()
    expect(m.query().filters).toEqual([rule('count', 'Equal', 7)])
    await type(m, 'count', '7.5')
    vi.advanceTimersByTime(100)
    await flush()
    // The decimal is no rule, so the filter of the column goes.
    expect(m.query().filters).toEqual([])
  })

  it('makes no rule for a text that is not a number', () => {
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
    expect(m.wrapper.find('.qt-filter-condition').text()).toBe('Contains (2)')
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
    expect(
      m.wrapper.find('th[data-field="name"] .qt-filter-condition').text()
    ).toBe('Starts With')
    expect(
      m.wrapper.find('th[data-field="age"] .qt-filter-condition').text()
    ).toBe('Greater Than (>)')
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
    expect(m.wrapper.find('.qt-filter-condition').exists()).toBe(true)
    await m.setQuery(makeQuery())
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('')
    expect(m.wrapper.find('.qt-filter-condition').exists()).toBe(false)
  })

  it('keeps newer typing when a late echo of an earlier emit arrives', async () => {
    const m = mountIt({ ...base, filterDebounce: 100 }, { apply: false })
    await type(m, 'name', 'fo')
    vi.advanceTimersByTime(100)
    expect(m.events).toHaveLength(1)
    await type(m, 'name', 'foo')
    // The consumer answers the first emit only now, after the user kept typing.
    await m.applyEmitted(0)
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('foo')
    vi.advanceTimersByTime(100)
    expect(m.events).toHaveLength(2)
    expect(m.events[1][0].filters).toEqual([rule('name', 'Contains', 'foo')])
  })

  it('keeps the typing when several echoes arrive late and in order', async () => {
    const m = mountIt({ ...base, filterDebounce: 100 }, { apply: false })
    await type(m, 'name', 'fo')
    vi.advanceTimersByTime(100)
    await type(m, 'name', 'foo')
    vi.advanceTimersByTime(100)
    expect(m.events).toHaveLength(2)
    await m.applyEmitted(0)
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('foo')
    await m.applyEmitted(1)
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('foo')
    expect(m.events).toHaveLength(2)
  })

  it('follows an outside change that equals an old emit once another outside change came in between', async () => {
    const m = mountIt({ ...base, filterDebounce: 100 }, { apply: false })
    await type(m, 'name', 'fo')
    vi.advanceTimersByTime(100)
    await m.setQuery(makeQuery({ filters: [rule('name', 'Contains', 'bar')] }))
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('bar')
    await m.setQuery(makeQuery({ filters: [rule('name', 'Contains', 'fo')] }))
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('fo')
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
    expect(m.wrapper.find('.qt-filter-condition').text()).toBe('Starts With')
    await type(m, 'name', 'foo')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([rule('name', 'StartsWith', 'foo')])
  })

  it('clears the filter with null', async () => {
    const m = mountIt(
      {
        ...base,
        query: makeQuery({ filters: [rule('name', 'Contains', 'a')] })
      },
      { slots }
    )
    menus.name.setCondition(null)
    await flush()
    expect(m.query().filters).toEqual([])
    expect(input(m, 'name').attributes('disabled')).toBeUndefined()
  })

  it('lists no empty "no filter" condition', () => {
    mountIt(base, { slots })
    const values = menus.name.conditions.map(option => option.value)
    expect(values).not.toContain('')
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
          'filter-menu': (menu: FilterMenuSlotProps) => {
            menus[menu.column.field] = menu
            return h(menu.trigger)
          }
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
  const clearAll = (m: Mounted) => m.wrapper.find('.qt-clear-all-button')

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

  it('goes back to disabled when the column with the typed text is removed', async () => {
    const m = mountIt({ ...base, filterDebounce: 1000 })
    await type(m, 'name', 'abc')
    expect(clearAll(m).attributes('disabled')).toBeUndefined()
    await m.wrapper.setProps({
      columns: makeColumns().filter(column => column.field !== 'name')
    })
    await flush()
    expect(clearAll(m).attributes('disabled')).toBeDefined()
    vi.advanceTimersByTime(5000)
    expect(m.events).toEqual([])
  })

  it('empties what was typed and never applied', async () => {
    const m = mountIt({ ...base, filterDebounce: 1000 })
    await type(m, 'name', 'abc')
    await clearAll(m).trigger('click')
    vi.advanceTimersByTime(5000)
    expect(m.events).toEqual([])
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('')
  })

  const firstFilter = () => document.querySelector('thead .qt-filter-input')

  it('a keyed click hands the focus to the first filter', async () => {
    const m = mountIt({
      ...base,
      query: makeQuery({ filters: [rule('age', 'Equal', 3)] })
    })
    const button = clearAll(m).element as HTMLButtonElement
    button.focus()
    // `element.click()`: a click with `detail` 0, as a key gives.
    button.click()
    await flush()
    expect(reasons(m.events)).toEqual(['reset'])
    expect(button.disabled).toBe(true)
    expect(document.activeElement).toBe(firstFilter())
  })

  it.each([
    ['a pointer click', true, 1, true],
    ['a keyed click on a button without the focus', false, 0, true],
    ['a keyed click the consumer does not apply', true, 0, false]
  ])('moves no focus after %s', async (_, focused, detail, apply) => {
    const m = mountIt(
      { ...base, query: makeQuery({ filters: [rule('age', 'Equal', 3)] }) },
      { apply }
    )
    const outside = document.createElement('button')
    document.body.append(outside)
    const button = clearAll(m).element as HTMLButtonElement
    ;(focused ? button : outside).focus()
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }))
    await flush()
    expect(reasons(m.events)).toEqual(['reset'])
    expect(button.disabled).toBe(apply)
    expect(document.activeElement).not.toBe(firstFilter())
    outside.remove()
  })

  it('is enabled with rules that came from outside', () => {
    const m = mountIt({
      ...base,
      query: makeQuery({ filters: [rule('ghost', 'Equal', 1)] })
    })
    expect(clearAll(m).attributes('disabled')).toBeUndefined()
  })

  it('reaches the toolbar slot in a table without utility columns', async () => {
    const box: { slot: ToolbarSlotProps | null } = { slot: null }
    const m = mountIt(
      {
        filterable: true,
        filterDebounce: 1000,
        query: makeQuery({ page: 3, filters: [rule('age', 'Equal', 3)] })
      },
      {
        slots: {
          toolbar: (slot: ToolbarSlotProps) => {
            box.slot = slot
            return h('span', { class: 'toolbar' })
          }
        }
      }
    )
    expect(m.wrapper.find('.qt-clear-all-button').exists()).toBe(false)
    expect(box.slot?.canClearFilters).toBe(true)
    await type(m, 'name', 'abc')
    box.slot?.clearFilters()
    await flush()
    vi.advanceTimersByTime(5000)
    expect(reasons(m.events)).toEqual(['reset'])
    expect(m.events[0][0]).toEqual(makeQuery({ page: 1 }))
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('')
    expect(box.slot?.canClearFilters).toBe(false)
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
          'filter-datetime': (slot: FilterDatetimeSlotProps) => {
            box.slot = slot
            return h('span', { class: 'custom-date' }, String(slot.value))
          }
        }
      }
    )
    expect(m.wrapper.find('.custom-date').exists()).toBe(true)
    expect(m.wrapper.find('input[type="date"]').exists()).toBe(false)
    box.slot!.updateValue('2024-05-01')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([
      rule('joined', 'Equal', '2024-05-01')
    ])
    await flush()
    expect(m.wrapper.find('.custom-date').text()).toBe('2024-05-01')
  })
})

describe('C-42 Several rules on a column that is not text', () => {
  const twoRules = [rule('age', 'GreaterThan', 20), rule('age', 'LessThan', 40)]
  const menus: Record<string, FilterMenuSlotProps> = {}
  const menuSlot = {
    'filter-menu': ((menu: FilterMenuSlotProps) => {
      menus[menu.column.field] = menu
      return h(menu.trigger)
    }) as never
  }
  const ageInput = (m: Mounted) => input(m, 'age').element as HTMLInputElement

  it('shows the count in a read-only input and in the condition label, and emits nothing', async () => {
    const m = mountIt({ ...base, query: makeQuery({ filters: twoRules }) })
    await flush()
    expect(ageInput(m).readOnly).toBe(true)
    expect(ageInput(m).value).toBe('(2)')
    expect(
      m.wrapper.find('th[data-field="age"] .qt-filter-condition').text()
    ).toBe('Greater Than (>) (2)')
    vi.advanceTimersByTime(1000)
    expect(m.events).toEqual([])
  })

  it('keeps both rules when another column is typed in', async () => {
    const m = mountIt({ ...base, query: makeQuery({ filters: twoRules }) })
    await type(m, 'name', 'ali')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([
      ...twoRules,
      rule('name', 'Contains', 'ali')
    ])
  })

  it('becomes editable again when the rules shrink to one, from outside', async () => {
    const m = mountIt({ ...base, query: makeQuery({ filters: twoRules }) })
    await m.setQuery(makeQuery({ filters: [twoRules[0]] }))
    await flush()
    expect(ageInput(m).readOnly).toBe(false)
    expect(ageInput(m).value).toBe('20')
  })

  it('is cleared by the clear action of the column', async () => {
    const m = mountIt(
      {
        ...base,
        query: makeQuery({ page: 2, filters: twoRules }),
        totalRows: 100
      },
      { slots: menuSlot }
    )
    menus.age.clear()
    await flush()
    expect(reasons(m.events)).toEqual(['filter'])
    expect(m.query().filters).toEqual([])
    expect(ageInput(m).readOnly).toBe(false)
    expect(ageInput(m).value).toBe('')
  })

  it('is cleared by clear all', async () => {
    const m = mountIt({ ...base, query: makeQuery({ filters: twoRules }) })
    await m.wrapper.find('.qt-clear-all-button').trigger('click')
    await flush()
    expect(m.query().filters).toEqual([])
    expect(ageInput(m).readOnly).toBe(false)
  })

  it('is replaced by one rule when the filter-datetime slot edits a date column', () => {
    const box: { slot: FilterDatetimeSlotProps | null } = { slot: null }
    const rules = [
      rule('joined', 'GreaterThan', '2024-01-01'),
      rule('joined', 'LessThan', '2024-12-31')
    ]
    const m = mountIt(
      {
        ...base,
        columns: [{ field: 'joined', type: 'date' }],
        query: makeQuery({ filters: rules })
      },
      {
        slots: {
          'filter-datetime': (slot: FilterDatetimeSlotProps) => {
            box.slot = slot
            return h('span', { class: 'custom-date' }, String(slot.value))
          }
        }
      }
    )
    // The slot does not see a value it could echo back by accident.
    expect(box.slot!.value).toBe('')
    expect(m.wrapper.find('.qt-filter-condition').text()).toBe('After (>) (2)')
    vi.advanceTimersByTime(1000)
    expect(m.events).toEqual([])
    box.slot!.updateValue('2024-06-01')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([
      rule('joined', 'GreaterThan', '2024-06-01')
    ])
  })

  it('is replaced by one rule of the first value when a condition is picked from the menu', async () => {
    const m = mountIt(
      { ...base, query: makeQuery({ filters: twoRules }) },
      { slots: menuSlot }
    )
    menus.age.setCondition('NotEqual')
    await flush()
    expect(m.events[0][0].filters).toEqual([rule('age', 'NotEqual', 20)])
    expect(ageInput(m).readOnly).toBe(false)
  })

  it('disables a bool select that holds several rules', () => {
    mountIt({
      ...base,
      columns: [{ field: 'active', type: 'bool' }],
      query: makeQuery({
        filters: [rule('active', 'Equal', true), rule('active', 'Equal', false)]
      })
    })
    const select = mounted!.wrapper.find('th[data-field="active"] select')
    expect(select.attributes('disabled')).toBeDefined()
    expect(mounted!.wrapper.find('.qt-filter-condition').text()).toContain(
      '(2)'
    )
  })
})

describe('C-16 Number lists in the filter input', () => {
  const ageInput = (m: Mounted) => input(m, 'age').element as HTMLInputElement

  it('is a text input, so a list can be typed', () => {
    const m = mountIt(base)
    expect(ageInput(m).type).toBe('text')
  })

  it('applies a typed list as one rule per value', async () => {
    const m = mountIt(base)
    await type(m, 'age', '20,40')
    vi.advanceTimersByTime(100)
    await flush()
    expect(m.query().filters).toEqual([
      rule('age', 'Equal', 20),
      rule('age', 'Equal', 40)
    ])
    await type(m, 'age', '!20,!40')
    vi.advanceTimersByTime(100)
    await flush()
    expect(m.query().filters).toEqual([
      rule('age', 'NotEqual', 20),
      rule('age', 'NotEqual', 40)
    ])
    expect(
      m.wrapper.find('th[data-field="age"] .qt-filter-condition').text()
    ).toBe('Not Equal (≠) (2)')
  })

  it('emits no rule for a mixed list or a value that does not read', async () => {
    const m = mountIt(base)
    await type(m, 'age', '20,!40')
    vi.advanceTimersByTime(100)
    await type(m, 'age', '20,abc')
    vi.advanceTimersByTime(100)
    expect(m.events).toEqual([])
  })

  it('shows an outside list as editable text', async () => {
    const m = mountIt({
      ...base,
      query: makeQuery({
        filters: [rule('age', 'Equal', 20), rule('age', 'Equal', 40)]
      })
    })
    await flush()
    expect(ageInput(m).readOnly).toBe(false)
    expect(ageInput(m).value).toBe('20,40')
    vi.advanceTimersByTime(1000)
    expect(m.events).toEqual([])
  })

  it('shows an outside list of bounds as its count, since it does not read back', async () => {
    const m = mountIt({
      ...base,
      query: makeQuery({
        filters: [
          rule('age', 'GreaterThan', 20),
          rule('age', 'GreaterThan', 40)
        ]
      })
    })
    await flush()
    expect(ageInput(m).readOnly).toBe(true)
    expect(ageInput(m).value).toBe('(2)')
    vi.advanceTimersByTime(1000)
    expect(m.events).toEqual([])
  })
})

describe('C-43 A rule the shortcuts cannot say', () => {
  it('shows an external Equal rule with a star as typed, emits nothing, and reads the text as a shortcut once edited', async () => {
    const m = mountIt({
      ...base,
      query: makeQuery({ filters: [rule('name', 'Equal', 'a*')] })
    })
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('a*')
    vi.advanceTimersByTime(1000)
    expect(m.events).toEqual([])
    // Touching the text, even retyping it, reads `a*` as StartsWith `a`.
    await type(m, 'name', 'a*')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([rule('name', 'StartsWith', 'a')])
  })
})

describe('C-112 Column filterConditions', () => {
  const menus: Record<string, FilterMenuSlotProps> = {}
  const slots = {
    'filter-menu': ((menu: FilterMenuSlotProps) => {
      menus[menu.column.field] = menu
      return h(menu.trigger)
    }) as never
  }
  const offered = (field: string) =>
    menus[field].conditions.map(option => option.value)

  it('without it the menu offers the list of the type, as in 3.12', () => {
    mountIt(base, { slots })
    expect(offered('age')).not.toContain('IsNull')
    expect(offered('age')).not.toContain('Between')
    expect(offered('name')).toContain('Contains')
  })

  it('replaces the list, in its order, and leaves out what the type does not take', () => {
    const columns: Column[] = [
      {
        field: 'name',
        filterConditions: [
          'IsNotNull',
          'Between',
          'Equal',
          'GreaterThan',
          'IsNull'
        ]
      },
      {
        field: 'age',
        type: 'number',
        filterConditions: ['Between', 'Contains', 'IsNull', 'Equal', 'Between']
      }
    ]
    mountIt({ ...base, columns }, { slots })
    expect(offered('name')).toEqual(['IsNotNull', 'Equal', 'IsNull'])
    expect(offered('age')).toEqual(['Between', 'IsNull', 'Equal'])
    expect(menus.age.conditions[0]).toEqual({
      value: 'Between',
      label: 'Between'
    })
  })
})

describe('C-113 A condition without a value in the filter row', () => {
  const menus: Record<string, FilterMenuSlotProps> = {}
  const slots = {
    'filter-menu': ((menu: FilterMenuSlotProps) => {
      menus[menu.column.field] = menu
      return h(menu.trigger)
    }) as never
  }
  const cell = (m: Mounted, field: string) =>
    m.wrapper.find(`th[data-field="${field}"] .qt-filter`)

  it('applies at once, hides the input and keeps the label', async () => {
    const m = mountIt(
      { ...base, query: makeQuery({ page: 3 }), totalRows: 100 },
      { slots }
    )
    menus.age.setCondition('IsNull')
    await flush()
    expect(m.events).toEqual([
      [
        makeQuery({ filters: [{ field: 'age', condition: 'IsNull' }] }),
        'filter'
      ]
    ])
    expect(Object.keys(m.query().filters[0])).toEqual(['field', 'condition'])
    expect(input(m, 'age').exists()).toBe(false)
    expect(cell(m, 'age').find('.qt-filter-condition').text()).toBe('Is Null')
  })

  it('shows the input again when a condition with a value is picked or the column is cleared', async () => {
    const m = mountIt(
      {
        ...base,
        query: makeQuery({
          filters: [{ field: 'name', condition: 'IsNotNull' }]
        })
      },
      { slots }
    )
    await flush()
    expect(input(m, 'name').exists()).toBe(false)
    menus.name.setCondition('Contains')
    await flush()
    expect(input(m, 'name').exists()).toBe(true)
    menus.name.setCondition('IsNotNull')
    await flush()
    expect(input(m, 'name').exists()).toBe(false)
    menus.name.clear()
    await flush()
    expect(input(m, 'name').exists()).toBe(true)
    expect(m.query().filters).toEqual([])
  })

  it('with another rule on a text column shows their count in a read-only input', async () => {
    const m = mountIt({
      ...base,
      query: makeQuery({
        filters: [
          { field: 'name', condition: 'IsNull' },
          rule('name', 'Contains', 'a')
        ]
      })
    })
    await flush()
    const element = input(m, 'name').element as HTMLInputElement
    expect(element.readOnly).toBe(true)
    expect(element.value).toBe('(2)')
  })
})

describe('C-114 Between in the filter row', () => {
  const menus: Record<string, FilterMenuSlotProps> = {}
  const slots = {
    'filter-menu': ((menu: FilterMenuSlotProps) => {
      menus[menu.column.field] = menu
      return h(menu.trigger)
    }) as never
  }
  // The lower bound is the first input of the cell, the upper one the second.
  const bound = (m: Mounted, field: string, which: 'lower' | 'upper') =>
    m.wrapper.findAll(`th[data-field="${field}"] .qt-filter-input`)[
      which === 'lower' ? 0 : 1
    ]
  const between = (field: string, value: FilterValue, value2: FilterValue) => ({
    field,
    condition: 'Between' as const,
    value,
    value2
  })

  it('draws two named inputs and applies one rule once both bounds read', async () => {
    const m = mountIt(base, { slots })
    menus.age.setCondition('Between')
    await flush()
    expect(
      m.wrapper.findAll('th[data-field="age"] .qt-filter-input')
    ).toHaveLength(2)
    expect(bound(m, 'age', 'lower').attributes('aria-label')).toBe(
      'Filter Age from'
    )
    expect(bound(m, 'age', 'upper').attributes('aria-label')).toBe(
      'Filter Age to'
    )
    expect(bound(m, 'age', 'lower').attributes('type')).toBe('number')
    await bound(m, 'age', 'lower').setValue('20')
    vi.advanceTimersByTime(100)
    expect(m.events).toEqual([])
    await bound(m, 'age', 'upper').setValue('30')
    vi.advanceTimersByTime(100)
    expect(m.events.map(([query]) => query.filters)).toEqual([
      [between('age', 20, 30)]
    ])
  })

  it('keeps the last applied query while the range is incomplete', async () => {
    const m = mountIt({
      ...base,
      query: makeQuery({ filters: [between('age', 20, 30)] })
    })
    await flush()
    expect((bound(m, 'age', 'upper').element as HTMLInputElement).value).toBe(
      '30'
    )
    await bound(m, 'age', 'upper').setValue('')
    await bound(m, 'age', 'upper').trigger('keydown', { key: 'Enter' })
    vi.advanceTimersByTime(1000)
    expect(m.events).toEqual([])
    await bound(m, 'age', 'upper').setValue('35')
    await bound(m, 'age', 'upper').trigger('keydown', { key: 'Enter' })
    expect(m.events[0][0].filters).toEqual([between('age', 20, 35)])
  })

  it('draws two date inputs, and the filter-datetime slot twice with its bound', async () => {
    const slotsSeen: FilterDatetimeSlotProps[] = []
    const query = makeQuery({
      filters: [between('joined', '2024-01-01', '2024-03-31')]
    })
    const plain = mountIt({ ...base, query })
    await flush()
    expect(bound(plain, 'joined', 'lower').attributes('type')).toBe('date')
    plain.wrapper.unmount()
    const m = mountIt(
      { ...base, query },
      {
        slots: {
          'filter-datetime': (slot: FilterDatetimeSlotProps) => {
            slotsSeen.push(slot)
            return h('span', { class: 'custom-date' }, String(slot.value))
          }
        }
      }
    )
    await flush()
    expect(m.wrapper.findAll('.custom-date').map(span => span.text())).toEqual([
      '2024-01-01',
      '2024-03-31'
    ])
    expect(slotsSeen.filter(slot => slot.bound === null)).toEqual([])
    const upper = slotsSeen.filter(slot => slot.bound === 'upper').at(-1)!
    upper.updateValue('2024-02-29')
    vi.advanceTimersByTime(100)
    expect(m.events[0][0].filters).toEqual([
      between('joined', '2024-01-01', '2024-02-29')
    ])
  })

  it('gives a one-value date filter the slot once with no bound', () => {
    const slotsSeen: FilterDatetimeSlotProps[] = []
    mountIt(base, {
      slots: {
        'filter-datetime': (slot: FilterDatetimeSlotProps) => {
          slotsSeen.push(slot)
          return h('span')
        }
      }
    })
    expect(slotsSeen.at(-1)?.bound).toBeNull()
  })
})

describe('C-116 Text that gives no rule', () => {
  const menus: Record<string, FilterMenuSlotProps> = {}
  const slots = {
    'filter-menu': ((menu: FilterMenuSlotProps) => {
      menus[menu.column.field] = menu
      return h(menu.trigger)
    }) as never
  }
  const invalid = (m: Mounted, field: string) =>
    m.wrapper
      .find(`th[data-field="${field}"] .qt-filter-input`)
      .attributes('aria-invalid')

  it('marks typed text that does not read, and clears the mark once it reads or is emptied', async () => {
    const m = mountIt(base)
    expect(invalid(m, 'age')).toBeUndefined()
    await type(m, 'age', '20,abc')
    expect(invalid(m, 'age')).toBe('true')
    await type(m, 'age', 'abc')
    expect(invalid(m, 'age')).toBe('true')
    await type(m, 'age', '20,!40')
    expect(invalid(m, 'age')).toBe('true')
    await type(m, 'age', '20,40')
    expect(invalid(m, 'age')).toBeUndefined()
    await type(m, 'age', 'abc')
    await type(m, 'age', '')
    expect(invalid(m, 'age')).toBeUndefined()
  })

  it('does not mark the text of an outside rule, and marks typed text once it removed the rules', async () => {
    const m = mountIt({
      ...base,
      columns: [{ field: 'n', type: 'integer' }],
      query: makeQuery({ filters: [rule('n', 'Equal', 2.5)] })
    })
    await flush()
    expect((input(m, 'n').element as HTMLInputElement).value).toBe('2.5')
    expect(invalid(m, 'n')).toBeUndefined()
    await type(m, 'n', '2,abc')
    vi.advanceTimersByTime(100)
    await flush()
    expect(m.query().filters).toEqual([])
    expect(invalid(m, 'n')).toBe('true')
  })

  it('does not mark a text column that reads, a count, a one-bound range or a no-value condition', async () => {
    const m = mountIt(
      {
        ...base,
        query: makeQuery({
          filters: [
            rule('name', 'Contains', 'a'),
            rule('name', 'Contains', 'b')
          ]
        })
      },
      { slots }
    )
    await flush()
    expect(invalid(m, 'name')).toBeUndefined()
    menus.age.setCondition('Between')
    await flush()
    await m.wrapper
      .findAll('th[data-field="age"] .qt-filter-input')[0]
      .setValue('20')
    expect(invalid(m, 'age')).toBeUndefined()
    menus.age.setCondition('IsNull')
    await flush()
    expect(
      m.wrapper.find('th[data-field="age"] .qt-filter-input').exists()
    ).toBe(false)
  })
})

describe('C-117 Column filterDefaultCondition', () => {
  const exact = (condition: FilterCondition): Column[] =>
    makeColumns().map(column =>
      column.field === 'name'
        ? { ...column, filterDefaultCondition: condition }
        : column
    )
  const label = (m: Mounted, field: string) =>
    m.wrapper.find(`th[data-field="${field}"] .qt-filter-condition`).text()

  it.each([
    ['foo', [rule('name', 'Equal', 'foo')]],
    ['a,b', [rule('name', 'Equal', 'a'), rule('name', 'Equal', 'b')]],
    ['*foo*', [rule('name', 'Contains', 'foo')]],
    ['foo*', [rule('name', 'StartsWith', 'foo')]],
    ['*foo', [rule('name', 'EndsWith', 'foo')]],
    ['!foo', [rule('name', 'NotEqual', 'foo')]],
    ['!*foo*', [rule('name', 'NotContains', 'foo')]]
  ])(
    'with Equal, %s gives its rules and the shortcuts keep theirs',
    async (text, expected) => {
      const m = mountIt({ ...base, columns: exact('Equal') })
      await type(m, 'name', text)
      vi.advanceTimersByTime(100)
      expect(m.events).toHaveLength(1)
      expect(m.events[0][0].filters).toEqual(expected)
    }
  )

  it('names the condition under the input', async () => {
    const m = mountIt({ ...base, columns: exact('Equal') })
    await type(m, 'name', 'foo')
    expect(label(m, 'name')).toBe('Equal (=)')
  })

  it('gives way to a condition picked in the menu', async () => {
    const menus: Record<string, FilterMenuSlotProps> = {}
    const m = mountIt(
      { ...base, columns: exact('Equal') },
      {
        slots: {
          'filter-menu': (menu: FilterMenuSlotProps) => {
            menus[menu.column.field] = menu
            return h(menu.trigger)
          }
        }
      }
    )
    await type(m, 'name', 'foo')
    vi.advanceTimersByTime(100)
    menus.name.setCondition('Contains')
    await flush()
    expect(m.query().filters).toEqual([rule('name', 'Contains', 'foo')])
  })

  it('shows an outside rule of it as plain text, and a Contains one with its shortcut', async () => {
    const m = mountIt({ ...base, columns: exact('Equal') })
    await m.setQuery(makeQuery({ filters: [rule('name', 'Equal', 'bob')] }))
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('bob')
    await m.setQuery(makeQuery({ filters: [rule('name', 'Contains', 'bob')] }))
    await flush()
    expect((input(m, 'name').element as HTMLInputElement).value).toBe('*bob*')
  })

  it.each<FilterCondition>(['GreaterThan', 'IsNull', 'Between'])(
    'counts %s on a text column as unset',
    async condition => {
      const m = mountIt({ ...base, columns: exact(condition) })
      await type(m, 'name', 'foo')
      vi.advanceTimersByTime(100)
      expect(m.events[0][0].filters).toEqual([rule('name', 'Contains', 'foo')])
    }
  )

  it('is read by parseFilterInput from the column it is given', () => {
    const column: Column = { field: 'name', filterDefaultCondition: 'Equal' }
    expect(parseFilterInput('foo', column)).toEqual([
      rule('name', 'Equal', 'foo')
    ])
    expect(parseFilterInput('*foo*', column)).toEqual([
      rule('name', 'Contains', 'foo')
    ])
    expect(parseFilterInput('foo', column, 'StartsWith')).toEqual([
      rule('name', 'StartsWith', 'foo')
    ])
  })
})

describe('C-118 IP column type', () => {
  const columns = (filterConditions?: FilterCondition[]): Column[] => [
    ...makeColumns(),
    { field: 'src', title: 'Source', type: 'ip', filterConditions }
  ]
  const menus: Record<string, FilterMenuSlotProps> = {}
  const slots = {
    'filter-menu': ((menu: FilterMenuSlotProps) => {
      menus[menu.column.field] = menu
      return h(menu.trigger)
    }) as never
  }
  const label = (m: Mounted) =>
    m.wrapper.find('th[data-field="src"] .qt-filter-condition').text()
  const between = (value: string, value2: string) => ({
    field: 'src',
    condition: 'Between' as const,
    value,
    value2
  })

  it.each([
    ['10.0.0.1', [rule('src', 'Equal', '10.0.0.1')]],
    [
      '10.0.0.1,fe80::1',
      [rule('src', 'Equal', '10.0.0.1'), rule('src', 'Equal', 'fe80::1')]
    ],
    [
      '!10.0.0.1,!10.0.0.2',
      [rule('src', 'NotEqual', '10.0.0.1'), rule('src', 'NotEqual', '10.0.0.2')]
    ],
    ['10.1.0.0/16', [between('10.1.0.0', '10.1.255.255')]]
  ])('%s gives its rules', async (text, expected) => {
    const m = mountIt({ ...base, columns: columns() })
    await type(m, 'src', text)
    vi.advanceTimersByTime(100)
    expect(m.events).toHaveLength(1)
    expect(m.events[0][0].filters).toEqual(expected)
  })

  it.each(['*1.70*', '172.16*', '*.5', '1.70', 'abc', '10.0.0.1,!10.0.0.2'])(
    '%s gives no rule and marks the input',
    async text => {
      const m = mountIt({ ...base, columns: columns() })
      await type(m, 'src', text)
      vi.advanceTimersByTime(100)
      await flush()
      expect(m.events).toEqual([])
      expect(input(m, 'src').attributes('aria-invalid')).toBe('true')
    }
  )

  it('keeps a typed CIDR prefix in the input and names it Between', async () => {
    const m = mountIt({ ...base, columns: columns() })
    await type(m, 'src', '10.1.0.0/16')
    vi.advanceTimersByTime(100)
    await flush()
    expect((input(m, 'src').element as HTMLInputElement).value).toBe(
      '10.1.0.0/16'
    )
    expect(label(m)).toBe('Between')
  })

  it('shows an outside range that is one prefix as CIDR text', async () => {
    const m = mountIt({ ...base, columns: columns() })
    await m.setQuery(
      makeQuery({ filters: [between('172.16.0.0', '172.31.255.255')] })
    )
    await flush()
    expect((input(m, 'src').element as HTMLInputElement).value).toBe(
      '172.16.0.0/12'
    )
  })

  it('offers Equal and NotEqual, and of a column list no text condition', () => {
    mountIt({ ...base, columns: columns() }, { slots })
    expect(menus.src.conditions.map(option => option.value)).toEqual([
      'Equal',
      'NotEqual'
    ])
    mounted?.wrapper.unmount()
    mountIt(
      {
        ...base,
        columns: columns([
          'Equal',
          'Contains',
          'StartsWith',
          'Between',
          'IsNull'
        ])
      },
      { slots }
    )
    expect(menus.src.conditions.map(option => option.value)).toEqual([
      'Equal',
      'Between',
      'IsNull'
    ])
  })

  it('takes Between with two text inputs and two addresses', async () => {
    const m = mountIt({ ...base, columns: columns(['Between']) }, { slots })
    menus.src.setCondition('Between')
    await flush()
    const bounds = m.wrapper.findAll('th[data-field="src"] .qt-filter-input')
    expect(bounds.map(bound => bound.attributes('type'))).toEqual([
      'text',
      'text'
    ])
    await bounds[0].setValue('10.0.0.1')
    await bounds[1].setValue('10.0.0.9')
    vi.advanceTimersByTime(100)
    expect(m.events.map(([query]) => query.filters)).toEqual([
      [between('10.0.0.1', '10.0.0.9')]
    ])
  })

  it('parseFilterInput reads an ip column the same way', () => {
    const column = { field: 'src', type: 'ip' as const }
    expect(parseFilterInput('10.1.0.0/16', column)).toEqual([
      between('10.1.0.0', '10.1.255.255')
    ])
    expect(parseFilterInput('*1.70*', column)).toEqual([])
  })
})
