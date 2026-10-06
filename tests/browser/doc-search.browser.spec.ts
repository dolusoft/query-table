import { afterEach, beforeEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../playground/playground.css'
import App from '../../playground/App.vue'
import { router } from '../../playground/router'

// The playground's documentation search: shortcuts, MiniSearch hits, the
// jump to a page anchor, and focus handling of the dialog.

const dialog = () => document.querySelector('[data-slot="dialog-content"]')
const searchInput = () => page.getByTestId('doc-search-input')

beforeEach(async () => {
  try {
    localStorage.clear()
  } catch {
    // Storage may be unavailable; the search works without it.
  }
  await router.push('/overview')
  await router.isReady()
  await render(App, { global: { plugins: [router] } })
  await expect.element(page.getByRole('heading', { level: 1 })).toBeVisible()
})

afterEach(() => {
  document.body.style.pointerEvents = ''
})

test('Ctrl+K opens the search in the upper part of the viewport', async () => {
  await page.viewport(1440, 900)
  await userEvent.keyboard('{Control>}k{/Control}')
  await expect.element(searchInput()).toBeVisible()
  await expect.element(searchInput()).toHaveFocus()
  const top = dialog()!.getBoundingClientRect().top
  expect(top).toBeGreaterThan(0)
  expect(top).toBeLessThan(window.innerHeight / 4)
  await userEvent.keyboard('{Escape}')
  await page.viewport(1280, 800)
})

test('a prop name finds its row and Enter jumps to the anchor on that page', async () => {
  await userEvent.keyboard('{Control>}k{/Control}')
  await userEvent.type(searchInput(), 'footerRows')
  const hit = page.getByCSS('[data-doc-id="footer-rows:props:footerRows"]')
  await expect.element(hit).toBeVisible()
  await expect.element(hit).toHaveAttribute('data-highlighted')
  expect(hit.element().querySelector('mark')?.textContent).toBe('footerRows')
  await userEvent.keyboard('{Enter}')
  await expect.poll(() => router.currentRoute.value.path).toBe('/footer-rows')
  await expect.poll(() => dialog()).toBeNull()
  const row = page.getByCSS('#api-props-footerRows')
  await expect.element(row).toHaveAttribute('data-search-target')
})

test('Esc closes the search and gives focus back', async () => {
  const button = page.getByTestId('doc-search-button')
  await userEvent.click(button)
  await expect.element(searchInput()).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => dialog()).toBeNull()
  await expect.element(button).toHaveFocus()
})

test('slash opens the search, but not while typing in a filter input', async () => {
  const filter = page.getByCSS('th[data-field="name"] .qt-filter-input')
  await userEvent.click(filter)
  await userEvent.keyboard('/')
  expect(dialog()).toBeNull()
  await expect.element(filter).toHaveValue('/')
  ;(document.activeElement as HTMLElement).blur()
  await userEvent.keyboard('/')
  await expect.element(searchInput()).toBeVisible()
  await userEvent.keyboard('{Escape}')
})

test('a search with no hits shows the empty state', async () => {
  await userEvent.keyboard('{Control>}k{/Control}')
  await userEvent.type(searchInput(), 'zzqqxx')
  await expect.element(page.getByTestId('doc-search-empty')).toBeVisible()
  await userEvent.keyboard('{Escape}')
})
