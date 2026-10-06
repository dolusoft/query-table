import axe from 'axe-core'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../../playground/playground.css'
import App from '../../../playground/App.vue'
import { router } from '../../../playground/router'

// The theme switch of the playground shell: a shadcn-vue single toggle group.
// Each item is a toggle button whose `aria-pressed` says which theme is on;
// no role is forced onto the items, so the ARIA stays reka-ui's own.

const group = () => page.getByRole('group', { name: 'Theme' })
const item = (name: string) =>
  group().getByRole('button', { name, exact: true })
const pressed = () =>
  [...document.querySelectorAll('[aria-label="Theme"] button')]
    .filter(button => button.getAttribute('aria-pressed') === 'true')
    .map(button => button.textContent?.trim())

beforeEach(async () => {
  await router.push('/overview')
  await router.isReady()
  await render(App, { global: { plugins: [router] } })
  await expect.element(group()).toBeVisible()
})

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

test('the theme items are toggle buttons; exactly one is pressed', async () => {
  for (const button of document.querySelectorAll(
    '[aria-label="Theme"] button'
  )) {
    expect(button.getAttribute('role')).toBeNull()
    expect(button.hasAttribute('aria-checked')).toBe(false)
  }
  expect(pressed()).toEqual(['system'])

  await userEvent.click(item('dark'))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(pressed()).toEqual(['dark'])

  // Pressing the active item keeps the theme: it always has a value.
  await userEvent.click(item('dark'))
  expect(document.documentElement.dataset.theme).toBe('dark')
  await expect.poll(pressed).toEqual(['dark'])

  await userEvent.click(item('system'))
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  expect(pressed()).toEqual(['system'])
})

test('the theme switch has no accessibility violation (axe)', async () => {
  const root = document.querySelector('[aria-label="Theme"]')!
  const result = await axe.run(root, { resultTypes: ['violations'] })
  expect(
    result.violations.map(
      violation =>
        `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`
    )
  ).toEqual([])
})

test('on a phone, the theme items and the page links are at least 44px tall', async () => {
  await page.viewport(390, 844)
  try {
    const heights = () =>
      [
        ...document.querySelectorAll('[aria-label="Theme"] button'),
        ...document.querySelectorAll('aside nav a')
      ].map(element => element.getBoundingClientRect().height)
    expect(heights().length).toBeGreaterThan(3)
    // The phone layout applies once the new viewport has been laid out.
    await expect.poll(() => Math.min(...heights())).toBeGreaterThanOrEqual(44)
  } finally {
    await page.viewport(1280, 800)
  }
})
