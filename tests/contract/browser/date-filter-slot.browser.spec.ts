import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref } from 'vue'

import QueryTable, {
  type FilterDatetimeSlotProps,
  type Query,
  type QueryChangeReason,
  type TableQuery
} from '@dolusoft/query-table'

import { el, makeQuery, rows, rule, sleep } from '../../support/fixtures'
import { traceUpdate } from '../../support/trace'

test.each(['date', 'datetime'] as const)(
  'F12 C-35 a %s slot replaces the native input, applies an exact rule and clears it',
  async type => {
    const other = rule('name', 'Contains', 'Name')
    const sort = { field: 'name', direction: 'desc' as const }
    const query = ref(makeQuery({ page: 3, sort, filters: [other] }))
    const updates: Array<{ query: TableQuery; reason: QueryChangeReason }> = []
    await render(
      defineComponent(
        () => () =>
          h(
            QueryTable,
            {
              query: query.value,
              columns: [{ field: 'joined', title: 'Joined', type }],
              rows: rows(),
              filterable: true,
              filterDebounce: 0,
              'onUpdate:query': (next: Query, reason: QueryChangeReason) => {
                if (!('page' in next)) {
                  throw new Error('Expected a page query')
                }
                traceUpdate(next, reason)
                updates.push({ query: next, reason })
                query.value = next
              }
            },
            {
              'filter-datetime': (slot: FilterDatetimeSlotProps) =>
                h('input', {
                  type: type === 'date' ? 'date' : 'datetime-local',
                  class: 'custom-date',
                  'aria-label': `Custom ${slot.column.field} ${slot.column.type}`,
                  value: slot.value,
                  onInput: (event: Event) =>
                    slot.updateValue((event.target as HTMLInputElement).value)
                })
            }
          )
      )
    )
    // Native date controls have no textbox role in Chromium; use the slot hook.
    const control = page.getByCSS('.custom-date')
    await expect.element(control).toBeVisible()
    expect(
      el('th[data-field="joined"] .qt-filter').querySelectorAll('input')
    ).toHaveLength(1)
    expect(el('.custom-date')).toHaveAttribute(
      'aria-label',
      `Custom joined ${type}`
    )
    const value = type === 'date' ? '2024-05-01' : '2024-05-01T12:30'
    await userEvent.fill(control, value)
    await expect
      .poll(() => updates)
      .toEqual([
        {
          reason: 'filter',
          query: makeQuery({
            sort,
            filters: [other, rule('joined', 'Equal', value)]
          })
        }
      ])
    await sleep(0)
    expect(updates).toHaveLength(1)
    await expect.element(control).toHaveValue(value)
    await userEvent.fill(control, '')
    await expect.poll(() => updates.length).toBe(2)
    await sleep(0)
    expect(updates).toHaveLength(2)
    expect(updates[1]).toEqual({
      reason: 'filter',
      query: makeQuery({ sort, filters: [other] })
    })
    await expect.element(control).toHaveValue('')
  }
)
