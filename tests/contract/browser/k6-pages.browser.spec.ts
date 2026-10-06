import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../../apps/playground/playground.css'
import SearchSelectionCursors from '../../../apps/playground/examples/SearchSelectionCursors.vue'
import TanstackPath from '../../../apps/playground/examples/TanstackPath.vue'

// The two K6 pages of the playground: the component with cursor paging,
// search and selection, and the same plugins under a table of the page's own.

const firstIds = () =>
  [...document.querySelectorAll('tbody > tr')].map(
    row => row.querySelector('td:not(:has(input))')?.textContent?.trim() ?? ''
  )

test('cursor paging walks forward and back with the cursors of the server C-56 C-65', async () => {
  await render(SearchSelectionCursors)
  await expect.element(page.getByText('Cursor paging')).toBeVisible()
  const previous = page.getByRole('button', { name: 'Previous' })
  const next = page.getByRole('button', { name: 'Next' })
  await expect.element(previous).toBeDisabled()
  expect(firstIds()[0]).toBe('1')
  await userEvent.click(next)
  await expect.poll(() => firstIds()[0]).toBe('11')
  await expect.element(page.getByText('page', { exact: true })).toBeVisible()
  await userEvent.click(previous)
  await expect.poll(() => firstIds()[0]).toBe('1')
})

test('typed search is applied once, after the debounce, from the first page C-58 C-63', async () => {
  await render(SearchSelectionCursors)
  await userEvent.click(page.getByRole('button', { name: 'Next' }))
  await expect.poll(() => firstIds()[0]).toBe('11')
  await userEvent.type(page.getByRole('searchbox'), 'bursa')
  await expect.element(page.getByText('search', { exact: true })).toBeVisible()
  await expect
    .poll(() =>
      [...document.querySelectorAll('tbody > tr')].every(row =>
        row.textContent?.includes('Bursa')
      )
    )
    .toBe(true)
  expect(firstIds()[0]).toBe('4')
})

test('the checkbox column selects rows into the page selection C-59 C-64', async () => {
  await render(SearchSelectionCursors)
  const rows = document.querySelectorAll<HTMLInputElement>('.qt-select-row')
  expect(rows).toHaveLength(10)
  await userEvent.click(rows[1])
  await expect
    .poll(() => document.querySelector('.selected-keys')?.textContent?.trim())
    .toBe('2')
  await userEvent.click(document.querySelector('.qt-select-all')!)
  await expect
    .poll(() => document.querySelectorAll('tr[data-selected]').length)
    .toBe(10)
  await userEvent.click(page.getByRole('button', { name: 'Clear selection' }))
  await expect
    .poll(() => document.querySelectorAll('tr[data-selected]').length)
    .toBe(0)
})

test('the TanStack path sorts, filters and pages through the query', async () => {
  await render(TanstackPath)
  const json = () =>
    JSON.parse(document.querySelector('.query-json')!.textContent) as {
      page: number
      sort: unknown
      filters: unknown[]
    }
  await expect
    .poll(() => document.querySelector('.page-info')?.textContent)
    .toMatch(/Page 1 of 25/)
  await userEvent.click(page.getByRole('button', { name: 'Next' }))
  await expect.poll(() => json().page).toBe(2)
  await userEvent.click(page.getByRole('button', { name: /^Age/ }))
  await expect
    .poll(() => json().sort)
    .toEqual({ field: 'age', direction: 'asc' })
  await userEvent.type(page.getByLabelText('Filter name'), 'Al*{Enter}')
  await expect
    .poll(() => json().filters)
    .toEqual([{ field: 'name', condition: 'StartsWith', value: 'Al' }])
  expect(json().page).toBe(1)
  const names = [...document.querySelectorAll('.tanstack-table tbody tr')].map(
    row => row.children[0]?.textContent?.trim()
  )
  expect(names.length).toBeGreaterThan(0)
  expect(names.every(name => name === 'Alice')).toBe(true)
})
