import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref } from 'vue'

import '../../../apps/playground/playground.css'
import QueryTable, {
  type FilterDatetimeSlotProps,
  type Query,
  type TableQuery
} from '@dolusoft/query-table'

import FilterDatePicker from '../../../apps/playground/harness/FilterDatePicker.vue'
import { makeQuery, rows, rule } from '../../support/fixtures'

// The calendar popover a consumer puts in the `filter-datetime` slot (the
// playground's shadcn-vue date picker): Esc closes it and focus goes back to
// the button that opened it, and picking a day does the same.
const renderPicker = async () => {
  const query = ref(makeQuery())
  const updates: TableQuery[] = []
  await render(
    defineComponent(
      () => () =>
        h(
          QueryTable,
          {
            query: query.value,
            columns: [{ field: 'joined', title: 'Joined', type: 'date' }],
            rows: rows(),
            filterable: true,
            filterDebounce: 0,
            'onUpdate:query': (next: Query) => {
              if (!('page' in next)) {
                throw new Error('Expected a page query')
              }
              updates.push(next)
              query.value = next
            }
          },
          {
            'filter-datetime': (date: FilterDatetimeSlotProps) =>
              h(FilterDatePicker, { date })
          }
        )
    )
  )
  const trigger = () => page.getByRole('button', { name: /^Filter Joined/ })
  const calendar = () =>
    document.querySelector<HTMLElement>('[data-slot="popover-content"]')
  return { updates, trigger, calendar }
}

test('Escape closes the calendar popover and returns focus to its trigger', async () => {
  const { updates, trigger, calendar } = await renderPicker()
  await userEvent.click(trigger())
  await expect.poll(() => calendar()?.dataset.state).toBe('open')
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => calendar()).toBeNull()
  expect(document.activeElement).toBe(trigger().element())
  expect(updates).toEqual([])
})

test('picking a day closes the popover, filters once and returns focus to the trigger', async () => {
  const { updates, trigger, calendar } = await renderPicker()
  await userEvent.click(trigger())
  await expect.poll(() => calendar()?.dataset.state).toBe('open')
  const day = calendar()!.querySelector<HTMLElement>(
    '[data-radix-vue-calendar-cell-trigger], [data-reka-calendar-cell-trigger], [role="gridcell"] [role="button"]'
  )
  expect(day).not.toBeNull()
  await userEvent.click(day!)
  await expect.poll(() => updates).toHaveLength(1)
  expect(updates[0].filters).toEqual([
    rule('joined', 'Equal', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
  ])
  await expect.poll(() => calendar()).toBeNull()
  expect(document.activeElement).toBe(trigger().element())
})
