import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../../apps/playground/playground.css'
import App from '../../../apps/playground/App.vue'
import { pages } from '../../../apps/playground/manifest'
import { router } from '../../../apps/playground/router'

// The playground's home page at `/`: the hero, the showcase table, the
// sections the search links to, and the documentation routes next to it.

const showcase = () =>
  document.querySelector<HTMLElement>('[data-testid="showcase"]')

const renderAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  await render(App, { global: { plugins: [router] } })
}

test('/ is the home page with the install command and the showcase', async () => {
  await page.viewport(1280, 900)
  await renderAt('/')
  await expect
    .element(page.getByRole('heading', { level: 1, name: 'Query Table' }))
    .toBeVisible()
  await expect.element(page.getByTestId('install-command')).toBeVisible()
  expect(
    document.querySelector('[data-testid="install-command"] code')?.textContent
  ).toMatch(/^pnpm add @dolusoft\/query-table@\d+\.\d+\.\d+(?:-[\w.]+)?$/)
  await expect
    .element(page.getByRole('button', { name: 'Copy install command' }))
    .toBeVisible()
  // The fake server answers after a short delay.
  await expect
    .element(page.getByText('200 events match.'), { timeout: 3000 })
    .toBeVisible()
  const root = showcase()!
  expect(root.hasAttribute('data-compact')).toBe(false)
  expect(root.querySelectorAll('thead [data-pinned]').length).toBeGreaterThan(0)
  expect(root.querySelector('tfoot')?.textContent).toContain('200 events')
  for (const id of ['showcase', 'principles', 'architecture']) {
    expect(document.getElementById(id), id).not.toBeNull()
  }
  // No diagram file in the tests: the image stays hidden, nothing broken.
  const diagram = document.querySelector<HTMLImageElement>('#architecture img')
  expect(diagram && getComputedStyle(diagram).display).toBe('none')
})

test('the showcase is compact on a phone', async () => {
  await page.viewport(375, 812)
  await renderAt('/')
  await expect
    .element(page.getByText('200 events match.'), { timeout: 3000 })
    .toBeVisible()
  await expect.poll(() => showcase()?.hasAttribute('data-compact')).toBe(true)
  await expect.element(page.getByTestId('add-filter')).toBeVisible()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
})

test('the docs link opens the first page and every page keeps its route', async () => {
  await page.viewport(1280, 900)
  await renderAt('/')
  await userEvent.click(page.getByRole('link', { name: 'Docs', exact: true }))
  await expect.poll(() => router.currentRoute.value.path).toBe('/overview')
  for (const entry of pages) {
    const resolved = router.resolve(`/${entry.id}`)
    expect(resolved.matched.length, entry.id).toBe(1)
    expect(resolved.meta.landing, entry.id).toBeUndefined()
  }
  await router.push('/no-such-page')
  expect(router.currentRoute.value.path).toBe('/')
})

test('the first load shows skeleton rows and a blank footer, no totals yet', async () => {
  await page.viewport(1280, 900)
  await renderAt('/')
  const root = showcase()!
  expect(root.querySelectorAll('tbody [data-slot="skeleton"]').length).toBe(80)
  expect(root.querySelector('tfoot')?.textContent).not.toMatch(/\d/)
  await expect
    .element(page.getByText('200 events match.'), { timeout: 3000 })
    .toBeVisible()
  expect(root.querySelectorAll('[data-slot="skeleton"]').length).toBe(0)
  expect(root.querySelector('tfoot')?.textContent).toContain('200 events')
})
