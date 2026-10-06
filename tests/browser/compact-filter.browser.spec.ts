import { afterEach, beforeEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref } from 'vue'

import '../../playground/playground.css'
import Overview from '../../playground/examples/Overview.vue'
import ColumnFilterSheet from '../../playground/harness/ColumnFilterSheet.vue'
import type { TableQuery } from '../../src/contract'

// The compact filter UI of the Overview page at phone width: the header
// filter row is off, each header has a funnel that opens a sheet for its
// column, and chips above the table show the committed filters.

const funnel = (field: string) =>
  page.getByCSS(`th[data-field="${field}"] .column-filter-trigger`)
const sheet = () =>
  document.querySelector<HTMLDialogElement>(
    '[data-testid="column-filter-sheet"]'
  )!
const chipTexts = () =>
  [...document.querySelectorAll('[data-testid="filter-chip"]')].map(chip =>
    chip.textContent?.trim()
  )
const pageInfo = () => page.getByCSS('.page-info')

beforeEach(async () => {
  await page.viewport(375, 800)
})
afterEach(async () => {
  await page.viewport(1280, 800)
})

test('at 375px the filter row is off, funnels open a sheet and nothing overflows', async () => {
  await render(Overview)
  await expect.element(funnel('city')).toBeVisible()
  expect(document.querySelector('.qt-filter-input')).toBeNull()
  await expect
    .element(funnel('city'))
    .toHaveAttribute('aria-haspopup', 'dialog')
  await expect.element(funnel('city')).toHaveAccessibleName('Filter City')
  const box = funnel('city').element().getBoundingClientRect()
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  // The sort button and the funnel are siblings, not nested.
  expect(funnel('city').element().closest('.qt-sort')).toBeNull()

  await userEvent.click(funnel('city'))
  expect(sheet().open).toBe(true)
  await expect
    .element(page.getByRole('dialog'))
    .toHaveAccessibleName('Filter City')
  expect(document.activeElement).toBe(sheet().querySelector('input'))
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
})

test('Apply commits once, goes to page 1 and returns focus', async () => {
  await render(Overview)
  await userEvent.click(page.getByCSS('.next-page'))
  await expect.element(pageInfo()).toHaveTextContent('Page 2 of 14')

  await userEvent.click(funnel('age'))
  const select = page.getByRole('combobox', { name: 'Condition' })
  await userEvent.selectOptions(select, 'GreaterThan')
  const value = page.getByRole('textbox', { name: 'Value' })
  await userEvent.type(value, '44')
  // Typing alone sends nothing: the table still shows page 2 of all rows.
  await expect.element(pageInfo()).toHaveTextContent('Page 2 of 14')
  await userEvent.keyboard('{Enter}')

  expect(sheet().open).toBe(false)
  await expect.element(pageInfo()).toHaveTextContent('Page 1 of 4')
  expect(chipTexts()).toEqual(['Age greater than 44'])
  expect(document.activeElement).toBe(funnel('age').element())
  await expect.element(funnel('age')).toHaveAccessibleName('Filter Age, active')
})

test('Escape discards the draft and restores focus', async () => {
  await render(Overview)
  await userEvent.click(funnel('name'))
  await userEvent.type(page.getByRole('textbox', { name: 'Value' }), 'zzz')
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => sheet().open).toBe(false)
  expect(chipTexts()).toEqual([])
  await expect.element(pageInfo()).toHaveTextContent('Page 1 of 14')
  expect(document.activeElement).toBe(funnel('name').element())
})

test('invalid numbers are rejected with a message, not cleared', async () => {
  await render(Overview)
  await userEvent.click(funnel('salary'))
  await userEvent.type(page.getByRole('textbox', { name: 'Value' }), '3x')
  await userEvent.click(page.getByRole('button', { name: 'Apply' }))
  expect(sheet().open).toBe(true)
  await expect
    .poll(() => sheet().querySelector('[role="alert"]')?.textContent)
    .toContain('Enter a number')
  expect(chipTexts()).toEqual([])
})

test('chips edit and remove; the add-filter picker reaches any column', async () => {
  await render(Overview)
  await userEvent.selectOptions(
    page.getByRole('combobox', { name: 'Add filter' }),
    'city'
  )
  await userEvent.type(page.getByRole('textbox', { name: 'Value' }), 'ank')
  await userEvent.click(page.getByRole('button', { name: 'Apply' }))
  expect(chipTexts()).toEqual(['City contains ank'])
  await expect.element(pageInfo()).toHaveTextContent('Page 1 of 3')

  // Editing reopens the sheet with the committed rule as its draft.
  await userEvent.click(
    page.getByRole('button', { name: 'Edit filter: City contains ank' })
  )
  await expect
    .element(page.getByRole('textbox', { name: 'Value' }))
    .toHaveValue('ank')
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => sheet().open).toBe(false)

  await userEvent.click(
    page.getByRole('button', { name: 'Remove filter: City contains ank' })
  )
  expect(chipTexts()).toEqual([])
  await expect.element(pageInfo()).toHaveTextContent('Page 1 of 14')
  expect(document.activeElement).toBe(
    page.getByRole('combobox', { name: 'Add filter' }).element()
  )
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
})

test('the sheet writes the query once per Apply, replacing only its column', async () => {
  const writes: TableQuery[] = []
  const query: TableQuery = {
    page: 3,
    pageSize: 15,
    sort: null,
    filters: [
      { field: 'name', condition: 'Equal', value: 'Bob' },
      { field: 'age', condition: 'LessThan', value: 20 },
      { field: 'age', condition: 'GreaterThan', value: 60 }
    ]
  }
  const sheetRef = ref<{ open: (field: string) => Promise<void> } | null>(null)
  const Host = defineComponent(
    () => () =>
      h(ColumnFilterSheet, {
        ref: sheetRef,
        columns: [
          { field: 'name', title: 'Name' },
          { field: 'age', title: 'Age', type: 'number' }
        ],
        query,
        'onUpdate:query': (next: TableQuery) => writes.push(next)
      })
  )
  await render(Host)
  await sheetRef.value!.open('age')
  // Two rules cannot be shown in one input: the sheet summarises them.
  await expect
    .poll(
      () =>
        document.querySelector('[data-testid="column-filter-summary"]')
          ?.textContent
    )
    .toContain('Age less than 20 or greater than 60')
  await userEvent.type(page.getByRole('textbox', { name: 'Value' }), '30')
  expect(writes).toHaveLength(0)
  await userEvent.keyboard('{Enter}')
  expect(writes).toEqual([
    {
      ...query,
      page: 1,
      filters: [
        { field: 'name', condition: 'Equal', value: 'Bob' },
        { field: 'age', condition: 'Equal', value: 30 }
      ]
    }
  ])
})
