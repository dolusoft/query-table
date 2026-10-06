import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../../playground/playground.css'
import App from '../../../playground/App.vue'
import { router } from '../../../playground/router'

const rect = (selector: string) =>
  document.querySelector<HTMLElement>(selector)!.getBoundingClientRect()

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

test.each([
  [360, 800],
  [390, 844],
  [412, 915],
  [844, 390]
])(
  'playground remains usable at %ix%i',
  async (width, height) => {
    await page.viewport(width, height)
    await render(App, { global: { plugins: [router] } })

    // Examples mount after the route resolves: wait for the selectors a page
    // is measured through instead of assuming they are in the DOM already.
    const visit = async (
      route: string,
      heading: string,
      ...selectors: string[]
    ) => {
      await router.push('/' + route)
      await expect
        .element(page.getByRole('heading', { name: heading }))
        .toBeVisible()
      for (const selector of selectors) {
        await expect
          .poll(() => document.querySelector(selector), { timeout: 5000 })
          .not.toBeNull()
      }
      await frame()
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
    }

    await visit(
      'overview',
      'Overview',
      'aside nav a',
      '.qt-table-responsive',
      '.qt-pagination button'
    )
    // The page list scrolls sideways inside its shadcn-vue ScrollArea.
    const nav = document.querySelector<HTMLElement>(
      'aside nav [data-slot="scroll-area-viewport"]'
    )!
    expect(nav.scrollWidth).toBeGreaterThan(nav.clientWidth)
    expect(rect('aside nav a').height).toBeGreaterThanOrEqual(44)
    const scroller = document.querySelector<HTMLElement>(
      '.qt-table-responsive'
    )!
    const table = document.querySelector<HTMLElement>('.qt-table')!
    // The table keeps a 48rem floor: a narrower scroller scrolls sideways,
    // a wider one (landscape phone) fits it without any scrollbar.
    expect(table.getBoundingClientRect().width).toBeGreaterThanOrEqual(768)
    if (scroller.clientWidth < 768) {
      expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
    } else {
      expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth)
    }
    const headers = [...table.querySelectorAll('thead th[data-field]')].map(
      cell => cell.getBoundingClientRect()
    )
    for (let index = 1; index < headers.length; index++) {
      expect(headers[index].left).toBeGreaterThanOrEqual(
        headers[index - 1].right - 1
      )
    }
    const pager = document.querySelector<HTMLElement>('.qt-pagination')!
    const pagerControls = [...pager.querySelectorAll('button, select')]
    for (const control of pagerControls) {
      const bounds = control.getBoundingClientRect()
      expect(bounds.height).toBeGreaterThanOrEqual(40)
      expect(bounds.right).toBeLessThanOrEqual(
        pager.getBoundingClientRect().right
      )
    }

    await visit(
      'filtering',
      'Filtering',
      '.qt-filter-button',
      '.qt-filter-input'
    )
    expect(rect('.qt-filter-button').height).toBeGreaterThanOrEqual(40)
    expect(rect('.qt-filter-input').height).toBeGreaterThanOrEqual(40)

    await visit(
      'column-pinning',
      'Column pinning',
      '.qt-table-responsive',
      'thead [data-pinned]'
    )
    const pinnedScroller = document.querySelector<HTMLElement>(
      '.qt-table-responsive'
    )!
    const pinned = [
      ...document.querySelectorAll<HTMLElement>('thead [data-pinned]')
    ]
    const lefts = pinned.map(cell => cell.getBoundingClientRect().left)
    pinnedScroller.scrollLeft = 240
    await frame()
    await frame()
    expect(pinnedScroller.scrollLeft).toBeGreaterThan(200)
    pinned.forEach((cell, index) => {
      expect(cell.getBoundingClientRect().left).toBeCloseTo(lefts[index], 0)
    })

    await visit('filter-parser', 'Filter parser')
  },
  30_000
)

// Headers that differ in height must still line up their filter rows. The
// sorting page mixes sortable columns (title in a 2.5rem sort button on a
// phone) with an unsortable one (title as plain text); the header-slot page
// puts a two-line title of the page's own in the Salary column.
test.each(
  ['sorting', 'header-slot'].flatMap(route =>
    [375, 390].map(width => [route, width] as const)
  )
)(
  'filter rows share one top on the %s page at %ipx',
  async (route, width) => {
    await page.viewport(width, 844)
    await render(App, { global: { plugins: [router] } })
    await router.push(`/${route}`)
    await expect
      .poll(
        () => document.querySelectorAll('.qt-table thead .qt-filter').length,
        { timeout: 5000 }
      )
      .toBeGreaterThan(1)
    await frame()
    const tops = [
      ...document.querySelectorAll<HTMLElement>(
        '.qt-table thead tr:first-child .qt-filter'
      )
    ].map(filter => filter.getBoundingClientRect().top)
    expect(tops.length).toBeGreaterThan(1)
    for (const top of tops) {
      expect(Math.abs(top - tops[0])).toBeLessThanOrEqual(1)
    }
  },
  30_000
)
