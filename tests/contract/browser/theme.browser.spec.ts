import { afterEach, describe, expect, test } from 'vitest'
import { cdp, page, userEvent } from 'vitest/browser'

import { el, renderTable } from '../../support/helpers'

// The test skin follows the OS theme and lets `data-theme` on <html> override
// it. The library ships no CSS and knows nothing about this.

const background = (css: string) => getComputedStyle(el(css)).backgroundColor
const colorScheme = () => getComputedStyle(document.documentElement).colorScheme

describe('C-41 the test skin has a light and a dark theme', () => {
  test('the table background differs between data-theme=light and data-theme=dark', async () => {
    const { rerender } = await renderTable({ theme: 'light' })
    expect(document.documentElement.dataset.theme).toBe('light')
    const light = background('.qt-datatable')
    expect(colorScheme()).toBe('light')

    await rerender({ theme: 'dark' })
    expect(document.documentElement.dataset.theme).toBe('dark')
    const dark = background('.qt-datatable')
    expect(colorScheme()).toBe('dark')

    expect(light).not.toBe(dark)
    expect(light).not.toBe('rgba(0, 0, 0, 0)')
    expect(dark).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('the text color follows the theme too', async () => {
    const { rerender } = await renderTable({ theme: 'light' })
    const light = getComputedStyle(el('.qt-table td')).color
    await rerender({ theme: 'dark' })
    expect(getComputedStyle(el('.qt-table td')).color).not.toBe(light)
  })

  // No `data-theme` attribute: the OS decides, through `prefers-color-scheme`.
  // Chromium's media emulation (CDP) stands in for the OS setting.
  describe('without data-theme, the OS decides', () => {
    const emulate = (scheme: 'light' | 'dark' | '') =>
      cdp().send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: scheme }]
      })

    afterEach(() => emulate(''))

    test.each([
      { os: 'dark', theme: undefined, active: 'dark' },
      { os: 'light', theme: undefined, active: 'light' },
      { os: 'light', theme: 'dark', active: 'dark' },
      { os: 'dark', theme: 'light', active: 'light' }
    ] as const)(
      'native pagination and popover follow $active (OS=$os, override=$theme)',
      async ({ os, theme, active }) => {
        await emulate(os)
        const { filterButton } = await renderTable({ theme })
        const token = (name: string) =>
          getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim()
        expect(getComputedStyle(el('.page-size select')).colorScheme).toBe(
          active
        )
        // An inherited dark scheme alone is insufficient on Windows Chromium:
        // the select surface must be opaque or its native popup can stay white.
        await expect
          .poll(() => background('.page-size select'))
          .toBe(token('--background'))
        expect(background('body')).toBe(token('--background'))
        expect(background('.qt-datatable')).toBe(token('--background'))
        expect(background('.page-size option')).toBe(token('--popover'))
        expect(getComputedStyle(el('.page-size option')).color).toBe(
          token('--popover-foreground')
        )
        await userEvent.click(filterButton('name'))
        await expect.element(page.getByText('Filter Condition')).toBeVisible()
        expect(background('[data-slot="popover-content"]')).toBe(
          token('--popover')
        )
        expect(
          getComputedStyle(el('[data-slot="popover-content"]')).color
        ).toBe(token('--popover-foreground'))
        await userEvent.keyboard('{Escape}')
      }
    )

    test('prefers-color-scheme dark gives the dark tokens, light the light ones', async () => {
      await emulate('light')
      const { rerender } = await renderTable()
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
      expect(colorScheme()).toBe('light')
      const light = background('.qt-datatable')
      const lightText = getComputedStyle(el('.qt-table td')).color

      await emulate('dark')
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
      expect(colorScheme()).toBe('dark')
      const dark = background('.qt-datatable')
      expect(dark).not.toBe(light)
      expect(dark).not.toBe('rgba(0, 0, 0, 0)')
      expect(getComputedStyle(el('.qt-table td')).color).not.toBe(lightText)

      // The tokens are the ones data-theme gives when it is set.
      await rerender({ theme: 'dark' })
      expect(background('.qt-datatable')).toBe(dark)
      await rerender({ theme: 'light' })
      expect(background('.qt-datatable')).toBe(light)
    })

    test('data-theme wins over the OS setting', async () => {
      await emulate('dark')
      await renderTable({ theme: 'light' })
      expect(colorScheme()).toBe('light')
    })
  })
})
