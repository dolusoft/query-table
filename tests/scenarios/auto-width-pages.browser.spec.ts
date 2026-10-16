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
// visible text or number filter input of a column without a given width
// keeps six characters of text. With the automatic table layout the header
// width was a hint only and the columns were squeezed under their filters.

let sheet: HTMLStyleElement
beforeAll(() => {
  sheet = document.createElement('style')
  sheet.textContent = playgroundCss
  document.head.append(sheet)
})
afterAll(() => sheet.remove())
afterEach(() => {
  cleanup()
})

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

/** Page, component, and whether its columns are drawn at automatic widths. */
const pages: [string, Component, boolean][] = [
  ['column-layout', ColumnLayout, true],
  ['filtering', Filtering, true],
  // Every column there has a width the page gives (C-49): no floor applies.
  ['column-resizing', ColumnResizing, false],
  ['overview', Overview, true]
]

const sides = (css: CSSStyleDeclaration) =>
  parseFloat(css.paddingLeft) +
  parseFloat(css.paddingRight) +
  parseFloat(css.borderLeftWidth) +
  parseFloat(css.borderRightWidth)

test.each(pages)(
  '%s draws each column at its header width and keeps six characters in each filter',
  async (name, view, floored) => {
    await page.viewport(1440, 900)
    await render(view)
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
      if (!floored || !input || input.getBoundingClientRect().width === 0) {
        continue
      }
      const css = getComputedStyle(input)
      // Six characters in the input's own font: a copy of it beside it,
      // six characters wide. A span with the computed `font` shorthand
      // misses what the shorthand cannot say (the ID input came out 1px
      // wider than its own `6ch`).
      const probe = input.cloneNode() as HTMLInputElement
      probe.style.cssText =
        'position: absolute; visibility: hidden; box-sizing: content-box; width: 6ch; flex: none'
      input.after(probe)
      const six = probe.getBoundingClientRect().width - sides(css)
      probe.remove()
      const text = input.getBoundingClientRect().width - sides(css)
      report[field].text = Math.round(text * 10) / 10
      // Six characters, less what the layout drew the column under its
      // header width (the pixel the check above allows).
      expect(text, `${name} ${field} text`).toBeGreaterThanOrEqual(
        six - Math.max(0, given - drawn) - 0.5
      )
    }
    console.log(`[auto-width-pages] ${name}`, JSON.stringify(report))
  },
  30_000
)
