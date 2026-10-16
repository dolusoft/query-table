import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import Overview from '../../../apps/playground/examples/Overview.vue'
import RowPinning from '../../../apps/playground/examples/RowPinning.vue'
import { el } from '../../support/helpers'

const rowIds = () =>
  [...document.querySelectorAll('.qt-table tbody tr')].map(row =>
    Number(row.querySelector('td[data-field="id"]')?.textContent)
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
  const expectAlignedColumns = () => {
    for (const header of document.querySelectorAll<HTMLElement>(
      'th[data-field]'
    )) {
      const field = header.dataset.field
      const cell = el(`.qt-table tbody tr td[data-field="${field}"]`)
      const { x, width } = header.getBoundingClientRect()
      const body = cell.getBoundingClientRect()
      expect({ x: body.x, width: body.width }).toEqual({ x, width })
    }
  }
  const userWidth = () =>
    el('th[data-field="user"]').getBoundingClientRect().width
  const initialUserWidth = userWidth()
  expectAlignedColumns()
  await userEvent.fill(input('user'), 'admin,svc-backup')
  await userEvent.keyboard('{Enter}')
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 1 of 2')
  expect(
    [
      ...document.querySelectorAll('.qt-table tbody tr td[data-field="user"]')
    ].every(cell => ['admin', 'svc-backup'].includes(cell.textContent ?? ''))
  ).toBe(true)
  await userEvent.click(
    page.getByCSS('th[data-field="hits"] .qt-filter-button')
  )
  await userEvent.click(
    page.getByRole('button', { name: 'Greater Than (>)', exact: true })
  )
  await userEvent.fill(input('hits'), '60')
  await userEvent.keyboard('{Enter}')
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 1 of 1')
  expect(rowIds()).toHaveLength(11)
  expect(el('.qt-table tbody tr td[data-field="user"]').textContent).toBe(
    'svc-backup'
  )
  // A new filter resets auto widths (C-100): shorter names never widen the
  // user column, and its filter row is a floor, so in this skin the column
  // stays at its filter's width (the reset itself is checked in
  // auto-width.browser.spec with content wider than the floor). Headers,
  // filters and body cells keep their alignment.
  expect(userWidth()).toBeLessThanOrEqual(initialUserWidth)
  expectAlignedColumns()
  const filteredGeometry = geometry()
  expect(filteredGeometry.map(({ y, height }) => ({ y, height }))).toEqual(
    initialGeometry.map(({ y, height }) => ({ y, height }))
  )
  await userEvent.fill(input('user'), 'zzz')
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByText('No results.')).toBeVisible()
  await expect.element(page.getByCSS('.next-page')).toBeDisabled()
  // No data rows means no new measure: the empty state keeps these widths.
  expect(geometry()).toEqual(filteredGeometry)
  await userEvent.fill(input('user'), '')
  await userEvent.keyboard('{Enter}')
  await userEvent.fill(input('hits'), '')
  await userEvent.keyboard('{Enter}')
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 1 of 14')
  expect(rowIds()).toHaveLength(15)
  expect(geometry()).toEqual(initialGeometry)
  expectAlignedColumns()
})

test('C-74 playground pin buttons stay enabled and focused after keyboard pinning', async () => {
  await render(RowPinning)
  for (const [label, position] of [
    ['Pin to top', 'top'],
    ['Pin to bottom', 'bottom']
  ]) {
    const button = document.querySelector<HTMLButtonElement>(
      `tr[data-row-index="1"] button[aria-label="${label}"]`
    )!
    button.focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(button).toHaveAttribute('aria-pressed', 'true')
    await expect.element(button).toBeEnabled()
    await expect.element(button).toHaveFocus()
    expect(button.closest('tr')?.getAttribute('data-pinned-row')).toBe(position)
    await userEvent.keyboard('{Enter}')
    await expect.element(button).toHaveFocus()
    expect(
      document.querySelectorAll(`tr[data-pinned-row="${position}"]`)
    ).toHaveLength(1)
  }
})
