import { afterEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../../apps/playground/playground.css'
import App from '../../../apps/playground/App.vue'
import { router } from '../../../apps/playground/router'
import {
  datasetId,
  resetDataset,
  savedDatasetId,
  selectDataset
} from '../../../apps/playground/scenarios/datasets'

// The demo data menu of the playground: one choice in the shell switches the
// home page showcase and every example page, and the browser keeps it.

afterEach(() => resetDataset())

// The top bar draws the menu twice: in the bar from sm up and in the
// phone menu sheet below it; only one is on screen.
const visibleMenu = () => {
  const menu = [
    ...document.querySelectorAll<HTMLElement>('[data-testid="dataset-menu"]')
  ].find(element => element.getClientRects().length > 0)
  expect(menu, 'a visible dataset menu').toBeDefined()
  return menu!
}

const pick = async (name: string) => {
  await userEvent.click(visibleMenu())
  // An item reads as its name and its kind ("Harbor Goods Store orders").
  await userEvent.click(
    page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) })
  )
}

const headerFields = (root: ParentNode = document) =>
  [...root.querySelectorAll('thead th[data-field]')].map(cell =>
    cell.getAttribute('data-field')
  )

test('the menu switches the showcase and an example page, and the choice is kept', async () => {
  await page.viewport(1280, 900)
  await router.push('/')
  await router.isReady()
  await render(App, { global: { plugins: [router] } })
  await expect
    .element(page.getByText('200 events match.'), { timeout: 3000 })
    .toBeVisible()
  expect(visibleMenu().getAttribute('aria-label')).toBe('Demo data: Vigil')
  expect(headerFields()).toContain('severity')

  await pick('Harbor Goods')
  await expect
    .element(page.getByText('200 orders match.'), { timeout: 3000 })
    .toBeVisible()
  expect(headerFields()).toContain('customer')
  expect(headerFields()).not.toContain('severity')
  expect(visibleMenu().getAttribute('aria-label')).toBe(
    'Demo data: Harbor Goods'
  )
  expect(datasetId()).toBe('harbor')

  // An example page mounts on the picked data.
  await router.push('/overview')
  await expect.poll(() => headerFields()).toContain('customer')

  // A change while an example page is open remounts it on the new data.
  selectDataset('ticker')
  await expect.poll(() => headerFields()).toContain('symbol')
  expect(headerFields()).not.toContain('customer')

  // A reload starts on the stored choice.
  expect(localStorage.getItem('query-table-playground:dataset')).toBe('ticker')
  expect(savedDatasetId()).toBe('ticker')
  resetDataset()
  expect(savedDatasetId()).toBe('vigil')
})
