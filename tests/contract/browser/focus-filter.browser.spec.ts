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

test('C-54 focusFilter returns false and moves no focus when there is no filter to focus', async () => {
  const table = ref<QueryTableExpose | null>(null)
  const filterable = ref(true)
  const cols = [
    { field: 'id', title: 'ID', type: 'number' as const, filterable: false },
    { field: 'name', title: 'Name', hide: true },
    { field: 'age', title: 'Age', type: 'number' as const },
    { field: 'active', title: 'Active', type: 'bool' as const }
  ]
  await render(
    defineComponent(
      () => () =>
        h(QueryTable, {
          ref: table,
          query: makeQuery({
            filters: [
              rule('active', 'Equal', true),
              rule('active', 'Equal', false)
            ]
          }),
          columns: cols,
          rows: rows(2),
          filterable: filterable.value
        })
    )
  )
  const outside = document.createElement('button')
  document.body.append(outside)
  outside.focus()
  // The bool select is disabled while several rules sit on its field.
  expect(el<HTMLSelectElement>('th[data-field="active"] select').disabled).toBe(
    true
  )
  // not filterable, hidden, unknown, disabled bool select (several rules)
  for (const field of ['id', 'name', 'nope', 'active']) {
    expect(table.value!.focusFilter(field)).toBe(false)
    expect(document.activeElement).toBe(outside)
  }
  expect(table.value!.focusFilter('age')).toBe(true)
  expect(document.activeElement).toBe(
    el('th[data-field="age"] .qt-filter-input')
  )
  outside.focus()
  filterable.value = false
  await expect.poll(() => document.querySelector('.qt-filter-input')).toBeNull()
  expect(table.value!.focusFilter('age')).toBe(false)
  expect(document.activeElement).toBe(outside)
  outside.remove()
})

const renderClearAll = async (filterDebounce: number) => {
  const query = ref(makeQuery())
  const updates: { reason: QueryChangeReason; query: Query }[] = []
  await render(
    defineComponent(
      () => () =>
        h(QueryTable, {
          query: query.value,
          columns: columns(),
          rows: rows(2),
          filterable: true,
          hasRightPanel: true,
          filterDebounce,
          'onUpdate:query': (next: Query, reason: QueryChangeReason) => {
            if (!('page' in next)) {
              throw new Error('Expected a page query')
            }
            traceUpdate(next, reason)
            updates.push({ reason, query: next })
            query.value = next
          }
        })
    )
  )
  return { updates, button: el<HTMLButtonElement>('.qt-clear-all-button') }
}

test.each([
  ['an applied filter', 0],
  ['text typed and not applied', 60_000]
] as const)(
  'C-22 clearing %s with the keyboard hands the focus to the first filter',
  async (_, filterDebounce) => {
    const { updates, button } = await renderClearAll(filterDebounce)
    await userEvent.fill(page.getByCSS('th[data-field="name"] input'), 'ali')
    await expect.poll(() => button.disabled).toBe(false)
    button.focus()
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => button.disabled).toBe(true)
    const first = el<HTMLInputElement>('th[data-field="id"] .qt-filter-input')
    await expect.poll(() => document.activeElement).toBe(first)
    await sleep(0)
    expect(updates.map(update => update.reason)).toEqual(
      filterDebounce === 0 ? ['filter', 'reset'] : []
    )
    expect(el<HTMLInputElement>('th[data-field="name"] input').value).toBe('')
    // The next Tab goes on from the filter, not from the top of the page.
    await userEvent.keyboard('{Tab}')
    expect(first.closest('thead')?.contains(document.activeElement)).toBe(true)
  }
)

test('C-22 a pointer click on clear all moves no focus to a filter', async () => {
  const { updates, button } = await renderClearAll(0)
  await userEvent.fill(page.getByCSS('th[data-field="name"] input'), 'ali')
  await expect.poll(() => button.disabled).toBe(false)
  await userEvent.click(button)
  await expect.poll(() => button.disabled).toBe(true)
  await sleep(0)
  expect(updates.map(update => update.reason)).toEqual(['filter', 'reset'])
  expect(document.activeElement?.tagName).not.toBe('INPUT')
})
