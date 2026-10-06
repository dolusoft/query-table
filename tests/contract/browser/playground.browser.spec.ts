import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import Overview from '../../../apps/playground/examples/Overview.vue'
import { el } from '../../support/helpers'

const rowIds = () =>
  [...document.querySelectorAll('.qt-table tbody tr')].map(row =>
    Number(row.querySelector('td')?.textContent)
  )
const input = (field: string) =>
  page.getByCSS(`th[data-field="${field}"] .qt-filter-input`)

test('the overview example serves real pages and sorts the whole dataset', async () => {
  await render(Overview)
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 1 of 14')
  expect(rowIds()).toHaveLength(15)
  const firstPage = rowIds()
  await userEvent.click(page.getByCSS('.next-page'))
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 2 of 14')
  expect(rowIds()).not.toEqual(firstPage)
  expect(rowIds().some(id => firstPage.includes(id))).toBe(false)
  await userEvent.selectOptions(
    page.getByRole('combobox', { name: 'Rows per page' }),
    '50'
  )
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 1 of 4')
  expect(rowIds()).toHaveLength(50)
  await userEvent.click(page.getByCSS('th[data-field="id"] .qt-sort'))
  expect(rowIds()).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
  await userEvent.click(page.getByCSS('th[data-field="id"] .qt-sort'))
  expect(rowIds()).toEqual(Array.from({ length: 50 }, (_, i) => 200 - i))
})

test('overview filters use emitted shortcuts, update totals, and recover from empty results', async () => {
  await render(Overview)
  const geometry = () =>
    [...document.querySelectorAll('th[data-field], .qt-filter-input')].map(
      element => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height }
      }
    )
  const initialGeometry = geometry()
  await userEvent.fill(input('name'), 'Alice,Bob')
  await userEvent.keyboard('{Enter}')
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 1 of 2')
  expect(
    [...document.querySelectorAll('.qt-table tbody tr td:nth-child(2)')].every(
      cell => ['Alice', 'Bob'].includes(cell.textContent ?? '')
    )
  ).toBe(true)
  await userEvent.click(page.getByCSS('th[data-field="age"] .qt-filter-button'))
  await userEvent.click(
    page.getByRole('button', { name: 'Greater Than (>)', exact: true })
  )
  await userEvent.fill(input('age'), '44')
  await userEvent.keyboard('{Enter}')
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 1 of 1')
  expect(rowIds()).toHaveLength(7)
  expect(el('.qt-table tbody tr td:nth-child(2)').textContent).toBe('Bob')
  expect(geometry()).toEqual(initialGeometry)
  await userEvent.fill(input('name'), 'zzz')
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByText('No results.')).toBeVisible()
  await expect.element(page.getByCSS('.next-page')).toBeDisabled()
  expect(geometry()).toEqual(initialGeometry)
  await userEvent.fill(input('name'), '')
  await userEvent.keyboard('{Enter}')
  await userEvent.fill(input('age'), '')
  await userEvent.keyboard('{Enter}')
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 1 of 14')
  expect(rowIds()).toHaveLength(15)
  expect(geometry()).toEqual(initialGeometry)
})
