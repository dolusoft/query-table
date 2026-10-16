import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../apps/playground/playground.css'
import App from '../../apps/playground/App.vue'
import { router } from '../../apps/playground/router'

// The documentation layout on a desktop, after the shadcn-vue docs: header,
// sidebar, page and "On This Page" share one 96rem frame centered in the
// window. On a wide screen the room left over goes to both sides evenly and
// the page is centered between the sidebar and "On This Page"; narrower, the
// frame is the window and nothing moves.

const rect = (selector: string) =>
  document.querySelector<HTMLElement>(selector)!.getBoundingClientRect()

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

const FRAME = 1536

const open = async (path: string, width: number) => {
  await page.viewport(width, 900)
  await router.push(path)
  await router.isReady()
  await render(App, { global: { plugins: [router] } })
  await expect
    .poll(() => document.querySelector('h1'), { timeout: 5000 })
    .not.toBeNull()
  await frame()
  // scrollbar-gutter reserves space even in headless Chromium. The root's
  // rendered width excludes that gutter; clientWidth can still include it.
  return rect('html').width
}

// 1535 to 1537: the edge where the frame stops growing with the window.
test.each([1280, 1343, 1344, 1440, 1535, 1536, 1537, 1920, 2560])(
  'the documentation page sits in a centered frame at %ipx',
  async width => {
    const viewport = await open('/overview', width)
    await expect
      .poll(() => document.querySelector('.qt-table-responsive'), {
        timeout: 5000
      })
      .not.toBeNull()
    await frame()

    const header = rect('header > div')
    const sidebar = rect('[data-slot="sidebar-container"]')
    const left = header.left
    const right = viewport - header.right
    // Even room on both sides, none until the window is wider than the frame.
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
    expect(header.width).toBeLessThanOrEqual(FRAME)
    if (viewport <= FRAME) {
      expect(left).toBeLessThanOrEqual(0.5)
    } else {
      expect(left).toBeGreaterThan(0)
    }
    // The sidebar starts at the header content's 24px inner gutter.
    expect(Math.abs(sidebar.left - (header.left + 24))).toBeLessThanOrEqual(1)

    // Title, text and preview keep one left edge.
    const title = rect('h1')
    const preview = rect('article [data-wide]')
    expect(Math.abs(rect('article p').left - title.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(preview.left - title.left)).toBeLessThanOrEqual(1)

    // "On This Page" from 84rem: a media query, so the window's width with
    // its scrollbar. With it the page is centered between the rails; without
    // it the page starts next to the sidebar.
    const toc = document.querySelector<HTMLElement>('aside')!
    const tocShown = getComputedStyle(toc).display !== 'none'
    expect(tocShown).toBe(window.innerWidth >= 1344)
    const block = document
      .querySelector('article')!
      .parentElement!.getBoundingClientRect()
    if (tocShown) {
      const end = toc.getBoundingClientRect().left
      expect(
        Math.abs((block.left + block.right) / 2 - (sidebar.right + end) / 2)
      ).toBeLessThanOrEqual(1)
    } else {
      expect(Math.abs(block.left - sidebar.right)).toBeLessThanOrEqual(1)
    }
    if (tocShown) {
      expect(
        Math.abs(toc.getBoundingClientRect().right - (header.right - 24))
      ).toBeLessThanOrEqual(1)
    }

    // The equal rails and frame gutters leave less than the Overview
    // table's 48rem floor at 1344px. Only its own box may scroll there.
    const scroller = document.querySelector<HTMLElement>(
      '.qt-table-responsive'
    )!
    expect(scroller.getBoundingClientRect().width).toBeLessThanOrEqual(
      preview.width
    )
    if (width === 1344) {
      expect(scroller.scrollWidth).toBe(768)
      expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
    } else {
      expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth)
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport)
  },
  30_000
)

test('the title does not jump when "On This Page" shows up at 84rem', async () => {
  await open('/overview', 1343)
  const before = rect('h1').left
  await page.viewport(1344, 900)
  await expect
    .poll(() => getComputedStyle(document.querySelector('aside')!).display)
    .not.toBe('none')
  await frame()
  expect(Math.abs(rect('h1').left - before)).toBeLessThanOrEqual(1)
})

test('the sidebar stays in the frame, below the header, while the page scrolls', async () => {
  await open('/overview', 1920)
  await expect
    .poll(() => document.querySelector('.qt-table-responsive'), {
      timeout: 5000
    })
    .not.toBeNull()
  const sidebar = '[data-slot="sidebar-container"]'
  const before = rect(sidebar)
  window.scrollTo(0, 600)
  await frame()
  expect(window.scrollY).toBe(600)
  const after = rect(sidebar)
  expect(Math.round(after.top)).toBe(64)
  // Sticky in the frame, not fixed to the window's edge: at 1920 the frame
  // starts well right of the window's left edge.
  expect(after.left).toBe(before.left)
  expect(
    Math.abs(after.left - (rect('header > div').left + 24))
  ).toBeLessThanOrEqual(1)
  expect(after.left).toBeGreaterThan(100)
  window.scrollTo(0, 0)
})

test('closing the sidebar (Ctrl+B) hides it and the page takes the room', async () => {
  await open('/overview', 1920)
  const sidebar = () =>
    document.querySelector<HTMLElement>('[data-slot="sidebar-container"]')!
  const block = () =>
    document.querySelector('article')!.parentElement!.getBoundingClientRect()
  const expanded = { sidebar: sidebar().getBoundingClientRect(), page: block() }
  expect(expanded.sidebar.width).toBeGreaterThan(0)

  await userEvent.keyboard('{Control>}b{/Control}')
  await expect.poll(() => sidebar().getClientRects().length).toBe(0)
  // Once the sidebar gap closes, the page stays centered between the
  // frame's inner left edge and the TOC; its max-width may now take effect.
  const header = rect('header > div')
  const end = rect('aside').left
  await expect
    .poll(() =>
      Math.abs(
        (block().left + block().right) / 2 - (header.left + 24 + end) / 2
      )
    )
    .toBeLessThanOrEqual(1)
  expect(block().left).toBeLessThan(expanded.page.left)
  expect(block().width).toBeGreaterThan(expanded.page.width)

  await userEvent.keyboard('{Control>}b{/Control}')
  await expect.poll(() => sidebar().getClientRects().length).toBeGreaterThan(0)
  await expect.poll(() => block().left).toBe(expanded.page.left)
  expect(sidebar().getBoundingClientRect().left).toBe(expanded.sidebar.left)
})

test('the home page header uses the same frame as the documentation', async () => {
  const viewport = await open('/', 1920)
  const home = rect('header > div')
  expect(Math.abs(home.left - (viewport - home.right))).toBeLessThanOrEqual(1)
  expect(home.width).toBe(FRAME)
})

test('the active sidebar label aligns with its group and has visible inner padding', async () => {
  await open('/overview', 1920)
  const link = document.querySelector<HTMLElement>(
    '[data-slot="sidebar-content"] a[aria-current="page"]'
  )!
  const group = link.closest('[data-slot="sidebar-group"]')!
  const label = group.querySelector('[data-slot="sidebar-group-label"]')!
  const viewport = link.closest('[data-slot="scroll-area-viewport"]')!
  const textRect = (element: Element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return range.getBoundingClientRect()
  }
  const text = textRect(link)
  expect(Math.abs(text.left - textRect(label).left)).toBeLessThanOrEqual(1)
  expect(
    text.left -
      Math.max(
        link.getBoundingClientRect().left,
        viewport.getBoundingClientRect().left
      )
  ).toBeGreaterThanOrEqual(8)
  expect(
    link.getBoundingClientRect().right - text.right
  ).toBeGreaterThanOrEqual(8)
})
