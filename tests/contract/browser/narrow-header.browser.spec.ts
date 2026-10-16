import { afterAll, beforeAll, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import ColumnLayout from '../../../apps/playground/examples/ColumnLayout.vue'
import playgroundCss from '../../../apps/playground/playground.css?inline'
import { el } from '../../support/helpers'

// The page CSS is added for this file only: the other browser tests measure
// the test skin alone.
let style: HTMLStyleElement
beforeAll(() => {
  style = document.createElement('style')
  style.textContent = playgroundCss
  document.head.append(style)
})
afterAll(() => style.remove())

// The playground's narrow headers (harness/FilterMenu.vue, playground.css): a
// header too narrow for its column controls on one line folds them into one
// "⋯" menu and its filter input into a funnel that opens the table's own
// input in a panel. The header row never wraps.

const visible = (element: Element | null) =>
  !!element && getComputedStyle(element).display !== 'none'

const lines = (elements: Element[]) =>
  new Set(elements.map(e => Math.round(e.getBoundingClientRect().top))).size

test('a narrow column-layout header folds its controls and keeps one line', async () => {
  await render(ColumnLayout)
  await expect
    .element(page.getByCSS('th[data-field="id"] [data-filter-toggle]'))
    .toBeVisible()
  const headers = [
    ...document.querySelectorAll<HTMLElement>('thead tr:first-child > th')
  ]
  for (const th of headers) {
    const filter = th.querySelector(':scope > .qt-filter')
    const row = filter?.querySelector('[data-header-controls] > span')
    const tools = filter?.querySelector('[data-header-tools]')
    if (!filter || !row || !tools) {
      continue
    }
    // Narrow exactly when the controls row does not fit on one line.
    const narrow = filter.clientWidth < (row as HTMLElement).offsetWidth
    expect(visible(tools), th.dataset.field).toBe(narrow)
    if (!narrow) {
      expect(lines([...row.children]), th.dataset.field).toBe(1)
    }
  }
  const id = el('th[data-field="id"]')
  expect(visible(id.querySelector('.qt-filter-input'))).toBe(false)
  expect(lines([...id.querySelectorAll('[data-header-tools] > button')])).toBe(
    1
  )
  // Every header is as tall as the widest one's two rows, no more.
  const wide = el('th[data-field="user"]')
  const content = [...wide.children].reduce(
    (bottom, child) => Math.max(bottom, child.getBoundingClientRect().bottom),
    0
  )
  expect(
    Math.round(wide.getBoundingClientRect().bottom - content)
  ).toBeLessThanOrEqual(12)
})

test('the funnel opens the table input in a panel and gives focus back', async () => {
  await render(ColumnLayout)
  const toggle = page.getByCSS('th[data-field="id"] [data-filter-toggle]')
  await expect.element(toggle).toHaveAccessibleName('Filter ID')
  await userEvent.click(toggle)
  await expect.element(toggle).toHaveAttribute('aria-expanded', 'true')
  const input = page.getByCSS('th[data-field="id"] .qt-filter-input')
  await expect.element(input).toHaveFocus()
  expect(input.element().getBoundingClientRect().width).toBeGreaterThan(200)
  await userEvent.keyboard('7{Enter}')
  await expect
    .element(page.getByCSS('th[data-field="id"]'))
    .toHaveAttribute('data-filtered')
  await userEvent.keyboard('{Escape}')
  await expect.element(toggle).toHaveFocus()
  await expect.element(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect.element(toggle).toHaveAccessibleName('Filter ID, active')
})

test('the ⋯ menu carries the column controls and returns focus', async () => {
  await render(ColumnLayout)
  const more = page.getByCSS('th[data-field="id"] [data-controls-menu]')
  await expect.element(more).toHaveAccessibleName('Column actions for ID')
  ;(more.element() as HTMLElement).focus()
  await userEvent.keyboard('{Enter}')
  const items = page.getByRole('menuitem')
  await expect.element(items.first()).toBeVisible()
  expect(items.elements().map(item => item.textContent?.trim())).toEqual([
    'Unpin',
    'Pin right',
    'Move left',
    'Move right',
    'Hide'
  ])
  await userEvent.keyboard('{Escape}')
  await expect.element(more).toHaveFocus()
})
