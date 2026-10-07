import axe from 'axe-core'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../../apps/playground/playground.css'
import App from '../../../apps/playground/App.vue'
import { router } from '../../../apps/playground/router'

// The theme switch of the playground shell: the site header's shadcn-vue
// dropdown menu. The button opens a radio group of light, dark and system;
// `aria-checked` says which theme is on. The ARIA is reka-ui's own.

const trigger = () => page.getByRole('button', { name: 'Theme', exact: true })
const option = (name: string) =>
  page.getByRole('menuitemradio', { name, exact: true })
const checked = () =>
  [...document.querySelectorAll('[role="menuitemradio"]')]
    .filter(item => item.getAttribute('aria-checked') === 'true')
    .map(item => item.textContent?.trim())
const menu = () => document.querySelector('[role="menu"]')

const pick = async (name: string) => {
  await userEvent.click(trigger())
  await expect.element(option(name)).toBeVisible()
  await userEvent.click(option(name))
  await expect.poll(menu).toBeNull()
}

beforeEach(async () => {
  await router.push('/overview')
  await router.isReady()
  await render(App, { global: { plugins: [router] } })
  await expect.element(trigger()).toBeVisible()
})

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

test('the theme items are radio menu items; exactly one is checked', async () => {
  await userEvent.click(trigger())
  await expect.element(option('System')).toBeVisible()
  expect(checked()).toEqual(['System'])
  await userEvent.keyboard('{Escape}')
  await expect.poll(menu).toBeNull()

  await pick('Dark')
  expect(document.documentElement.dataset.theme).toBe('dark')
  await userEvent.click(trigger())
  await expect.element(option('Dark')).toBeVisible()
  expect(checked()).toEqual(['Dark'])
  await userEvent.keyboard('{Escape}')
  await expect.poll(menu).toBeNull()

  await pick('System')
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
})

test('the theme switch has no accessibility violation (axe)', async () => {
  // Read before opening: the open menu hides the rest of the page from the
  // accessibility tree, the button with it.
  const button = trigger().element()
  await userEvent.click(trigger())
  await expect.element(option('System')).toBeVisible()
  // Checked once the menu's fade-in has ended: axe reads the colors of a
  // half-transparent menu as too low a contrast.
  await Promise.all(
    menu()!
      .getAnimations({ subtree: true })
      .map(animation => animation.finished)
  )
  for (const root of [button, menu()!]) {
    const result = await axe.run(root, { resultTypes: ['violations'] })
    expect(
      result.violations.map(
        violation =>
          `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`
      )
    ).toEqual([])
  }
  await userEvent.keyboard('{Escape}')
})

test('on a phone, the theme button and its items are at least 44px tall', async () => {
  await page.viewport(390, 844)
  try {
    // The phone layout applies once the new viewport has been laid out.
    await expect
      .poll(() => trigger().element().getBoundingClientRect().height)
      .toBeGreaterThanOrEqual(44)
    await userEvent.click(trigger())
    await expect.element(option('System')).toBeVisible()
    const heights = () =>
      [...document.querySelectorAll('[role="menuitemradio"]')].map(
        item => item.getBoundingClientRect().height
      )
    expect(heights()).toHaveLength(3)
    // Measured once the menu's zoom-in has ended (it opens at 95%).
    await expect.poll(() => Math.min(...heights())).toBeGreaterThanOrEqual(44)
    await userEvent.keyboard('{Escape}')
  } finally {
    await page.viewport(1280, 800)
  }
})
