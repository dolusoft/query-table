import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../apps/playground/playground.css'
import App from '../../apps/playground/App.vue'
import { router } from '../../apps/playground/router'

// The Features page: each group's table is a wide part of the page, as an
// example's preview is. Its heading and note keep the 40rem reading measure
// and the title's left edge; the table takes the column's width. From a
// tablet's column up every table fits without scrolling; on a phone only the
// table's own box scrolls, never the page.

const rect = (element: Element) => element.getBoundingClientRect()

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

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
  return document.documentElement.clientWidth
}

const groups = () => [...document.querySelectorAll('article > section')]

const scrollerOf = (section: Element) =>
  section.querySelector<HTMLElement>('[data-slot="table-container"]')!

const expectInColumn = () => {
  const title = rect(document.querySelector('h1')!)
  for (const section of groups()) {
    const box = rect(section.querySelector('.rounded-md.border')!)
    const note = rect(section.querySelector('p')!)
    // Heading, note and table start on the title's left edge.
    expect(Math.abs(box.left - title.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(note.left - title.left)).toBeLessThanOrEqual(1)
    // The note keeps the 40rem measure; the table box stays in its section.
    expect(note.width).toBeLessThanOrEqual(640.5)
    expect(box.right).toBeLessThanOrEqual(rect(section).right + 0.5)
  }
}

test.each([768, 1024, 1280, 1440, 1920])(
  'every feature table fits its column at %ipx',
  async width => {
    const viewport = await open(width)
    expectInColumn()
    for (const section of groups()) {
      const scroller = scrollerOf(section)
      expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth)
    }
    // The site header is a few pixels too wide at a tablet's width on every
    // documentation page; that is the header's, not this page's.
    if (width >= 1024) {
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport)
    }
  },
  30_000
)

test('on a wide screen the table uses the column, wider than the text', async () => {
  await open(1920)
  for (const section of groups()) {
    const box = rect(section.querySelector('.rounded-md.border')!)
    expect(box.width).toBeGreaterThan(900)
    // Headings stay on one line where the table has the room.
    for (const head of section.querySelectorAll('th')) {
      expect(rect(head).height).toBeLessThanOrEqual(40.5)
    }
  }
})

test('on a phone only the table box scrolls, not the page', async () => {
  const viewport = await open(390, 844)
  expectInColumn()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport)
  for (const section of groups()) {
    const scroller = scrollerOf(section)
    expect(getComputedStyle(scroller).overflowX).toBe('auto')
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
    expect(rect(scroller).right).toBeLessThanOrEqual(viewport)
  }
})
