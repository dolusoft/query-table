import { afterEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../apps/playground/playground.css'
import App from '../../apps/playground/App.vue'
import { router } from '../../apps/playground/router'
import { version } from '../../packages/vue/package.json'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

test.each(['light', 'dark'] as const)(
  'the channel menu shows the package version and selected release in %s theme',
  async theme => {
    await router.push('/overview')
    await router.isReady()
    await render(App, { global: { plugins: [router] } })
    document.documentElement.dataset.theme = theme

    const trigger = page.getByRole('button', {
      name: `Version: ${version}`,
      exact: true
    })
    await expect.element(trigger).toBeVisible()
    await userEvent.click(trigger)
    const release = page.getByRole('menuitemradio', {
      name: '3.x (release)',
      exact: true
    })
    const next = page.getByRole('menuitemradio', { name: 'next', exact: true })
    await expect.element(release).toBeVisible()
    await expect.element(release).toHaveAttribute('aria-checked', 'true')
    await expect.element(next).toHaveAttribute('aria-checked', 'false')
    await userEvent.keyboard('{Escape}')
    await expect.element(trigger).toHaveFocus()
  }
)
