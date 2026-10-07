import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../apps/playground/playground.css'
import App from '../../apps/playground/App.vue'
import { router } from '../../apps/playground/router'

// The Features page: each group's table is a wide part of the page, as an
// example's preview is. Its heading and note keep the 40rem reading measure
// and the title's left edge; the table takes the column's width. A column of
// 41rem or more fits every table; in a narrower one only the table's own box
// scrolls, never the page. features-layout.touch.spec.ts covers the phone.
//
// Headless Chromium draws no scrollbar, so a viewport here gives the column
// 15px more than the same window in a desktop Chrome. The edge cases are
// taken where that does not hide a regression: 1000px with the sidebar open
// leaves a 694px box, a few pixels over the widest table's least width.

const rect = (element: Element) => element.getBoundingClientRect()

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

// The vertical scrollbar of a desktop Chrome, measured in chrome-local.
const SCROLLBAR = 15

const open = async (width: number, height = 900) => {
  await page.viewport(width, height)
  await router.push('/features')
  await router.isReady()
  await render(App, { global: { plugins: [router] } })
  await expect
    .poll(() => document.querySelectorAll('article table').length, {
      timeout: 5000
    })
    .toBe(4)
  await frame()
  // The scroll container learns whether it overflows from a ResizeObserver.
  await frame()
  return document.documentElement.clientWidth
}

const groups = () => [...document.querySelectorAll('article > section')]

const boxOf = (section: Element) =>
  section.querySelector<HTMLElement>('[data-feature-table]')!

/** Every element of the group that scrolls sideways: the table's container only. */
const scrollersOf = (section: Element) =>
  [...section.querySelectorAll<HTMLElement>('*')].filter(element =>
    ['auto', 'scroll'].includes(getComputedStyle(element).overflowX)
  )

// Below md the sidebar is a Sheet: no container until the menu opens it.
const sidebarOpen = () =>
  (document.querySelector('[data-slot="sidebar-container"]')?.getClientRects()
    .length ?? 0) > 0

const expectInColumn = () => {
  const title = rect(document.querySelector('h1')!)
  for (const section of groups()) {
    const box = rect(boxOf(section))
    const note = rect(section.querySelector('p')!)
    // Heading, note and table start on the title's left edge.
    expect(Math.abs(box.left - title.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(note.left - title.left)).toBeLessThanOrEqual(1)
    // The note keeps the 40rem measure; the table box stays in its section.
    expect(note.width).toBeLessThanOrEqual(640.5)
    expect(box.right).toBeLessThanOrEqual(rect(section).right + 0.5)
    // One sideways scroller per group: the table's container.
    const scrollers = scrollersOf(section)
    expect(scrollers).toHaveLength(1)
    expect(scrollers[0].dataset.slot).toBe('table-container')
  }
}

const expectNoPageOverflow = (viewport: number) => {
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport)
}

test.each([
  [768, false],
  [1000, true],
  [1024, true],
  [1280, true],
  [1440, true],
  [1920, true]
])(
  'every feature table fits its column at %ipx (sidebar open: %s)',
  async (width, withSidebar) => {
    const viewport = await open(width)
    expect(sidebarOpen()).toBe(withSidebar)
    expectInColumn()
    for (const section of groups()) {
      const [scroller] = scrollersOf(section)
      expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth)
      // A table that fits is no Tab stop.
      expect(scroller.hasAttribute('tabindex')).toBe(false)
    }
    expectNoPageOverflow(viewport)
  },
  30_000
)

test('with the sidebar open at 820px the tables scroll in their boxes, not the page', async () => {
  const viewport = await open(820)
  expect(sidebarOpen()).toBe(true)
  expectInColumn()
  expectNoPageOverflow(viewport)
  for (const section of groups()) {
    const [scroller] = scrollersOf(section)
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
  }
})

test('a table that scrolls is a named region a keyboard can scroll', async () => {
  await open(820)
  for (const section of groups()) {
    const [scroller] = scrollersOf(section)
    expect(scroller.getAttribute('tabindex')).toBe('0')
    expect(scroller.getAttribute('role')).toBe('region')
    const name = document.getElementById(
      scroller.getAttribute('aria-labelledby')!
    )
    expect(name).toBe(section.querySelector('h2'))
  }
  const [scroller] = scrollersOf(groups()[0])
  scroller.focus()
  expect(document.activeElement).toBe(scroller)
  await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
  await expect.poll(() => scroller.scrollLeft).toBeGreaterThan(0)
})

test('on a wide screen the table uses the column, wider than the text', async () => {
  await open(1920)
  for (const section of groups()) {
    expect(rect(boxOf(section)).width).toBeGreaterThan(900)
    // Headings stay on one line where the table has the room.
    for (const head of section.querySelectorAll('th')) {
      expect(rect(head).height).toBeLessThanOrEqual(40.5)
    }
  }
})

// The least width of a table, whatever the window: what a column must give
// it so it does not scroll. Wrapping headings, a path that breaks after a
// slash and the 11rem "Feature" column keep every table within 41rem.
test('every feature table needs at most 41rem', async () => {
  // A box under 53rem: the headings may wrap there.
  await open(1000)
  for (const table of document.querySelectorAll<HTMLElement>('article table')) {
    table.style.width = 'min-content'
    const least = rect(table).width
    table.style.width = ''
    expect(least).toBeLessThanOrEqual(41 * 16)
  }
})

// 768: the sidebar's menu button, no site menu. 769: the site menu, no
// button: the tightest width.
test.each([768, 769, 800])(
  'the site header fits a %ipx window that shows a scrollbar',
  async width => {
    await open(width)
    expectNoPageOverflow(document.documentElement.clientWidth)
    // Headless draws no scrollbar: take its width off the header by hand.
    // Nothing may shrink to fit (the name broke onto two lines): what the
    // bar holds at its natural widths must fit.
    const header = document.querySelector<HTMLElement>('header > div')!
    const parts = [...header.children] as HTMLElement[]
    header.style.width = `${width - SCROLLBAR}px`
    for (const part of parts) {
      part.style.flexShrink = '0'
    }
    await frame()
    try {
      // The last part and the bar's end padding stay in the window. (The
      // bar's scrollWidth leaves the end padding out.)
      const end =
        Math.max(...parts.map(part => rect(part).right)) +
        parseFloat(getComputedStyle(header).paddingRight)
      expect(end - rect(header).left).toBeLessThanOrEqual(width - SCROLLBAR)
      const name = header.querySelector('a')!
      expect(rect(name).height).toBeLessThanOrEqual(24)
      // The menu button and the site menu never share the bar.
      const menuButton = header.querySelector('[data-sidebar="trigger"]')!
      const siteMenu = header.querySelector('nav[aria-label="Site"]')!
      expect(
        menuButton.getClientRects().length > 0 &&
          siteMenu.getClientRects().length > 0
      ).toBe(false)
    } finally {
      header.style.width = ''
      for (const part of parts) {
        part.style.flexShrink = ''
      }
    }
  }
)
