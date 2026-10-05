import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { renderTable, rows, shot } from './helpers'

// floating-vue computes positions from real layout (getBoundingClientRect,
// ResizeObserver). happy-dom has no layout, so these only mean something here.

// floating-vue removes the popper (or drops its shown class) once hidden.
const shownPopper = () => document.querySelector('.v-popper__popper--shown')

const filterButton = (field: string) =>
  page.getByCSS(`th[data-field="${field}"] .bh-filter-button`)

test('filter button opens the condition popover just below it, inside the viewport', async () => {
  await renderTable()
  const button = filterButton('name')
  await userEvent.click(button)

  const popover = page.getByText('Filter Condition')
  await expect.element(popover).toBeVisible()

  const popper = (popover.element() as HTMLElement).closest(
    '.v-popper__popper'
  ) as HTMLElement
  await expect.poll(() => popper.dataset.popperPlacement).toMatch(/^bottom/)
  // floating-vue anchors to its own `.v-popper` wrapper around the button.
  const b = (button.element() as HTMLElement)
    .closest('.v-popper')!
    .getBoundingClientRect()
  const p = popper.getBoundingClientRect()
  // placement="bottom-start" with distance 4 (plus floating-vue's arrow gap)
  expect(p.top).toBeGreaterThanOrEqual(b.bottom)
  expect(p.top - b.bottom).toBeLessThan(20)
  expect(Math.abs(p.left - b.left)).toBeLessThan(2)
  expect(p.right).toBeLessThanOrEqual(window.innerWidth)
  await shot('filter-popover-open')
})

test('choosing a sort in the popover emits a sort change and closes it', async () => {
  const { changes } = await renderTable()
  await userEvent.click(filterButton('name'))
  await userEvent.click(page.getByText(/Sort Descending/))
  await expect.poll(() => changes.length).toBe(1)
  expect(changes[0].payload).toMatchObject({
    sort_column: 'name',
    sort_direction: 'desc',
    change_type: 'sort'
  })
  await expect.poll(shownPopper).toBeNull()
})

test('clicking outside the popover closes it (auto-hide)', async () => {
  await renderTable()
  await userEvent.click(filterButton('name'))
  await expect.element(page.getByText('Filter Condition')).toBeVisible()
  // Far bottom-right of the page: nothing of the table or popover is there.
  await userEvent.click(page.getByCSS('body'), {
    position: { x: 1200, y: 760 }
  })
  await expect.poll(shownPopper).toBeNull()
})

test('clear-all button tooltip appears on hover', async () => {
  const { filterInput } = await renderTable({ hasRightPanel: true })
  // The button is disabled until a filter is active.
  await userEvent.click(filterInput('name'))
  await userEvent.keyboard('x{Enter}')
  const clearAll = page.getByCSS('.bh-clear-all-button')

  await expect.element(clearAll).toBeEnabled()
  await userEvent.hover(clearAll)
  await expect.element(page.getByText('Clear all filters')).toBeVisible()
})

test('stickyHeader + height gives a fixed-height scroll container the rows overflow', async () => {
  // Structure only: the scroll container's height and overflow are inline
  // styles. `bh-sticky` itself needs consumer CSS, so stickiness is not
  // asserted here.
  const { screen } = await renderTable({
    stickyHeader: true,
    height: '300px',
    footerOffset: 50,
    rows: rows(40),
    pageSize: 50
  })
  const scroller = screen.container.querySelector(
    '.bh-table-responsive'
  ) as HTMLElement
  expect(scroller.getBoundingClientRect().height).toBe(250)
  expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
  scroller.scrollTop = 200
  expect(scroller.scrollTop).toBe(200)
  await shot('sticky-scroll-container')
})

test('a column width set on the definition reaches the rendered header cell', async () => {
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
