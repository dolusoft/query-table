import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import type { Component } from 'vue'

import ColumnLayout from '../../apps/playground/examples/ColumnLayout.vue'
import ColumnResizing from '../../apps/playground/examples/ColumnResizing.vue'
import Filtering from '../../apps/playground/examples/Filtering.vue'
import Overview from '../../apps/playground/examples/Overview.vue'
import playgroundCss from '../../apps/playground/playground.css?inline'

// The playground's pages with `autoWidth` (C-100), with the page CSS: every
// column is drawn at the width the table gives its header cell, and every
// visible text or number filter input keeps six characters of text. With the
// automatic table layout the header width was a hint only and the columns
// were squeezed under their filters.

let style: HTMLStyleElement
beforeAll(() => {
  style = document.createElement('style')
  style.textContent = playgroundCss
  document.head.append(style)
})
afterAll(() => style.remove())
afterEach(() => {
  cleanup()
})

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

const pages: [string, Component][] = [
  ['column-layout', ColumnLayout],
  ['filtering', Filtering],
  ['column-resizing', ColumnResizing],
  ['overview', Overview]
]

const sides = (style: CSSStyleDeclaration) =>
  parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)

test.each(pages)(
  '%s draws each column at its header width and keeps six characters in each filter',
  async (name, Page) => {
    await page.viewport(1440, 900)
    await render(Page)
    await expect
      .poll(
        () =>
          document.querySelectorAll('thead th[data-field][style*="width"]')
            .length,
        { timeout: 5000 }
      )
      .toBeGreaterThan(0)
    for (let i = 0; i < 4; i++) {
      await frame()
    }
    const table = document.querySelector<HTMLElement>('.qt-table')!
    expect(getComputedStyle(table).tableLayout, name).toBe('fixed')
    const box = table.closest('.qt-table-responsive')!
    // Narrower than its box, the table spreads the rest over its columns.
    const stretched = table.getBoundingClientRect().width <= box.clientWidth + 1
    const report: Record<string, { th: number; drawn: number; text?: number }> =
      {}
    for (const th of document.querySelectorAll<HTMLElement>(
      'thead th[data-field][style*="width"]'
    )) {
      const field = th.dataset.field!
      const given = parseFloat(th.style.width)
      const drawn = th.getBoundingClientRect().width
      report[field] = { th: given, drawn: Math.round(drawn * 10) / 10 }
      if (stretched) {
        expect(drawn, `${name} ${field}`).toBeGreaterThanOrEqual(given - 1)
      } else {
        expect(Math.abs(drawn - given), `${name} ${field}`).toBeLessThanOrEqual(
          1
        )
      }
      const input = th.querySelector<HTMLInputElement>(
        ':scope > .qt-filter > input.qt-filter-input:is([type="text"], [type="number"])'
      )
      if (!input || input.getBoundingClientRect().width === 0) {
        continue
      }
      const inputStyle = getComputedStyle(input)
      const probe = document.createElement('span')
      probe.style.cssText = `position: absolute; visibility: hidden; width: 6ch; font: ${inputStyle.font}`
      document.body.append(probe)
      const six = probe.getBoundingClientRect().width
      probe.remove()
      const text = input.clientWidth - sides(inputStyle)
      report[field].text = Math.round(text * 10) / 10
      expect(text, `${name} ${field} text`).toBeGreaterThanOrEqual(six - 1)
    }
    console.log(`[auto-width-pages] ${name}`, JSON.stringify(report))
  },
  30_000
)
