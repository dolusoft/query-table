import { afterEach, describe, expect, test } from 'vitest'
import { cdp } from 'vitest/browser'

import { el, renderTable } from '../support/helpers'

// The test skin follows the OS theme and lets `data-theme` on <html> override
// it. The library ships no CSS and knows nothing about this.

const background = (css: string) => getComputedStyle(el(css)).backgroundColor
const colorScheme = () => getComputedStyle(document.documentElement).colorScheme

describe('C-41 the test skin has a light and a dark theme', () => {
  test('the table background differs between data-theme=light and data-theme=dark', async () => {
    const { rerender } = await renderTable({ theme: 'light' })
    expect(document.documentElement.dataset.theme).toBe('light')
    const light = background('.bh-datatable')
    expect(colorScheme()).toBe('light')

    await rerender({ theme: 'dark' })
    expect(document.documentElement.dataset.theme).toBe('dark')
    const dark = background('.bh-datatable')
    expect(colorScheme()).toBe('dark')

    expect(light).not.toBe(dark)
    expect(light).not.toBe('rgba(0, 0, 0, 0)')
    expect(dark).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('the text color follows the theme too', async () => {
    const { rerender } = await renderTable({ theme: 'light' })
    const light = getComputedStyle(el('.bh-table td')).color
    await rerender({ theme: 'dark' })
    expect(getComputedStyle(el('.bh-table td')).color).not.toBe(light)
  })

  // No `data-theme` attribute: the OS decides, through `prefers-color-scheme`.
  // Chromium's media emulation (CDP) stands in for the OS setting.
  describe('without data-theme, the OS decides', () => {
    const emulate = (scheme: 'light' | 'dark' | '') =>
      cdp().send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: scheme }]
      })

    afterEach(() => emulate(''))

    test('prefers-color-scheme dark gives the dark tokens, light the light ones', async () => {
      await emulate('light')
      const { rerender } = await renderTable()
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
      expect(colorScheme()).toBe('light')
      const light = background('.bh-datatable')
      const lightText = getComputedStyle(el('.bh-table td')).color

      await emulate('dark')
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
      expect(colorScheme()).toBe('dark')
      const dark = background('.bh-datatable')
      expect(dark).not.toBe(light)
      expect(dark).not.toBe('rgba(0, 0, 0, 0)')
      expect(getComputedStyle(el('.bh-table td')).color).not.toBe(lightText)

      // The tokens are the ones data-theme gives when it is set.
      await rerender({ theme: 'dark' })
      expect(background('.bh-datatable')).toBe(dark)
      await rerender({ theme: 'light' })
      expect(background('.bh-datatable')).toBe(light)
    })

    test('data-theme wins over the OS setting', async () => {
      await emulate('dark')
      await renderTable({ theme: 'light' })
      expect(colorScheme()).toBe('light')
    })
  })
})
