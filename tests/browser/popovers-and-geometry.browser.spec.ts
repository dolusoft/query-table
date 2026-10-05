import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { el, renderTable, rule, shot } from './helpers'

// The filter menu is drawn by the consumer: here a real shadcn-vue Popover
// (reka-ui) wraps the table's own trigger. Positions come from real layout,
// which happy-dom does not have, so these only mean something in a browser.

const openPopover = () =>
  document.querySelector('[data-slot="popover-content"]')

test('C-34 the filter button opens the condition popover just below it, inside the viewport', async () => {
  const { filterButton } = await renderTable()
  const button = filterButton('name')
  await userEvent.click(button)

  await expect.element(page.getByText('Filter Condition')).toBeVisible()
  const popover = el('[data-slot="popover-content"]')
  const b = (button.element() as HTMLElement).getBoundingClientRect()
  await expect.poll(() => popover.dataset.side).toBe('bottom')
  const p = popover.getBoundingClientRect()
  expect(p.top).toBeGreaterThanOrEqual(b.bottom)
  expect(p.top - b.bottom).toBeLessThan(12)
  expect(p.left).toBeGreaterThanOrEqual(0)
  expect(p.right).toBeLessThanOrEqual(window.innerWidth)
  await shot('filter-popover-open')
})

test('C-08 choosing a sort in the popover applies a sort and closes it', async () => {
  const { updates, filterButton } = await renderTable({
    query: {
      page: 3,
      pageSize: 10,
      sort: null,
      filters: [rule('age', 'Equal', 21)]
    }
  })
  await userEvent.click(filterButton('name'))
  await userEvent.click(page.getByText(/Sort Descending/))
  await expect.poll(() => updates.length).toBe(1)
  expect(updates[0].reason).toBe('sort')
  expect(updates[0].query).toEqual({
    page: 3,
    pageSize: 10,
    sort: { field: 'name', direction: 'desc' },
    filters: [rule('age', 'Equal', 21)]
  })
  await expect.poll(openPopover).toBeNull()
})

test('C-20 picking a condition with text typed applies it', async () => {
  const { updates, filterButton, filterInput } = await renderTable({
    filterDebounce: 2000
  })
  await userEvent.click(filterInput('name'))
  await userEvent.keyboard('foo')
  await userEvent.click(filterButton('name'))
  await userEvent.click(page.getByText('Starts With'))
  await expect.poll(() => updates.length).toBe(1)
  expect(updates[0].query.filters).toEqual([rule('name', 'StartsWith', 'foo')])
  await expect
    .element(page.getByCSS('.bh-filter-condition'))
    .toHaveTextContent('Starts With')
})

test('C-21 Clear filter in the popover clears that column only and keeps the sort', async () => {
  const { updates, filterButton } = await renderTable({
    query: {
      page: 2,
      pageSize: 10,
      sort: { field: 'age', direction: 'asc' },
      filters: [rule('name', 'Contains', 'a'), rule('age', 'Equal', 21)]
    }
  })
  await userEvent.click(filterButton('name'))
  await userEvent.click(page.getByText('Clear filter'))
  await expect.poll(() => updates.length).toBe(1)
  expect(updates[0].reason).toBe('filter')
  expect(updates[0].query).toEqual({
    page: 1,
    pageSize: 10,
    sort: { field: 'age', direction: 'asc' },
    filters: [rule('age', 'Equal', 21)]
  })
})

test('C-34 clicking outside the popover closes it', async () => {
  const { filterButton } = await renderTable()
  await userEvent.click(filterButton('name'))
  await expect.element(page.getByText('Filter Condition')).toBeVisible()
  // Far bottom-right of the page: nothing of the table or popover is there.
  await userEvent.click(page.getByCSS('body'), {
    position: { x: 1200, y: 760 }
  })
  await expect.poll(openPopover).toBeNull()
})

test('C-22 the clear-all button is a plain button with a title, enabled once a filter is active', async () => {
  const { filterInput } = await renderTable({ hasRightPanel: true })
  const clearAll = page.getByCSS('.bh-clear-all-button')
  await expect.element(clearAll).toBeDisabled()
  await userEvent.click(filterInput('name'))
  await userEvent.keyboard('x{Enter}')
  await expect.element(clearAll).toBeEnabled()
  // A tooltip is the consumer's business; the table sets `title` only.
  await expect.element(clearAll).toHaveAttribute('title', 'Clear all filters')
  expect(document.querySelector('[role="tooltip"]')).toBeNull()
})

test('C-31 a column width set on the definition reaches the rendered header cell', async () => {
  const { screen } = await renderTable({
    columns: [
      { field: 'id', title: 'ID', type: 'number', width: '120px' },
      { field: 'name', title: 'Name', width: '300px' }
    ]
  })
  const th = (field: string) =>
    screen.container
      .querySelector(`th[data-field="${field}"]`)!
      .getBoundingClientRect().width
  expect(th('id')).toBeGreaterThanOrEqual(120)
  expect(th('name')).toBeGreaterThanOrEqual(300)
  expect(th('name')).toBeGreaterThan(th('id'))
})
