import { describe, expect, test } from 'vitest'

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
})
