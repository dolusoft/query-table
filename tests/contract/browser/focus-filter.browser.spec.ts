import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref } from 'vue'

import QueryTable, {
  type FilterDatetimeSlotProps,
  type QueryTableExpose,
  type Query,
  type QueryChangeReason,
  type TableQuery
} from '@dolusoft/query-table'

import {
  columns,
  el,
  makeQuery,
  rows,
  rule,
  sleep
} from '../../support/fixtures'
import { traceUpdate } from '../../support/trace'

test.each(['input', 'date slot'] as const)(
  'C-54 focusFilter brings an offscreen %s into view and keeps focus after a query update',
  async kind => {
    const table = ref<QueryTableExpose | null>(null)
    const query = ref(makeQuery({ page: 3 }))
    const updates: TableQuery[] = []
    const data = ref(rows())
    await render(
      defineComponent(
        () => () =>
          h('div', { style: { width: '380px' } }, [
            h(
              QueryTable,
              {
                ref: table,
                query: query.value,
                columns: columns().map(column => ({
                  ...column,
                  width: '260px'
                })),
                rows: data.value,
                filterable: true,
                filterDebounce: 0,
                'onUpdate:query': (next: Query, reason: QueryChangeReason) => {
                  if (!('page' in next)) {
                    throw new Error('Expected a page query')
                  }
                  traceUpdate(next, reason)
                  updates.push(next)
                  query.value = next
                  data.value = rows(2)
                }
              },
              kind === 'date slot'
                ? {
                    'filter-datetime': (slot: FilterDatetimeSlotProps) => [
                      h('input', {
                        disabled: true,
                        'aria-label': 'Unavailable date'
                      }),
                      h('input', {
                        class: 'date-picker',
                        'aria-label': 'Pick date',
                        value: slot.value,
                        onInput: (event: Event) =>
                          slot.updateValue(
                            (event.target as HTMLInputElement).value
                          )
                      }),
                      h('input', { 'aria-label': 'Second date' })
                    ]
                  }
                : {}
            )
          ])
      )
    )
    const field = kind === 'input' ? 'age' : 'joined'
    const selector = `th[data-field="${field}"] ${kind === 'input' ? '.qt-filter-input' : '.date-picker'}`
    const viewport = el<HTMLElement>('.qt-table-responsive')
    // Scroll layout belongs to the consumer skin, not the library.
    el<HTMLElement>('.qt-table').style.minWidth = '1040px'
    await expect
      .poll(() => viewport.scrollWidth)
      .toBeGreaterThan(viewport.clientWidth)
    viewport.scrollLeft = 20
    const input = el<HTMLInputElement>(selector)
    expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth)
    expect(input.getBoundingClientRect().left).toBeGreaterThan(
      viewport.getBoundingClientRect().right
    )
    expect(table.value!.focusFilter(field)).toBe(true)
    await expect.poll(() => document.activeElement).toBe(input)
    await expect.poll(() => viewport.scrollLeft).toBeGreaterThan(20)
    const visible = viewport.getBoundingClientRect()
    const focused = input.getBoundingClientRect()
    expect(focused.left).toBeGreaterThanOrEqual(visible.left)
    expect(focused.right).toBeLessThanOrEqual(visible.right)
    await sleep(0)
    expect(updates).toEqual([])
    const value = kind === 'input' ? '25' : '2024-05-01'
    await userEvent.fill(page.getByCSS(selector), value)
    await expect
      .poll(() => updates)
      .toEqual([
        makeQuery({
          filters: [rule(field, 'Equal', kind === 'input' ? 25 : value)]
        })
      ])
    await sleep(0)
    expect(updates).toHaveLength(1)
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe(value)
    expect(input.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      viewport.getBoundingClientRect().left
    )
    expect(input.getBoundingClientRect().right).toBeLessThanOrEqual(
      viewport.getBoundingClientRect().right
    )
  }
)
