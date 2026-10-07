import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
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
  return document.documentElement.clientWidth
}

test.each([1280, 1440, 1920, 2560])(
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
    // The sidebar starts where the header's content frame starts.
    expect(Math.abs(sidebar.left - header.left)).toBeLessThanOrEqual(1)

    // Title, text and preview keep one left edge.
    const title = rect('h1')
    const preview = rect('article [data-wide]')
    expect(Math.abs(rect('article p').left - title.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(preview.left - title.left)).toBeLessThanOrEqual(1)

    // "On This Page" from 84rem; the page is centered between the rails.
    const toc = document.querySelector<HTMLElement>('aside')!
    const tocShown = getComputedStyle(toc).display !== 'none'
    expect(tocShown).toBe(viewport >= 1344)
    const end = tocShown ? toc.getBoundingClientRect().left : header.right
    const block = document
      .querySelector('article')!
      .parentElement!.getBoundingClientRect()
    expect(
      Math.abs((block.left + block.right) / 2 - (sidebar.right + end) / 2)
    ).toBeLessThanOrEqual(1)
    if (tocShown) {
      expect(
        Math.abs(toc.getBoundingClientRect().right - header.right)
      ).toBeLessThanOrEqual(1)
    }

    // The Overview table fits its preview: no sideways scroll.
    const scroller = document.querySelector<HTMLElement>(
      '.qt-table-responsive'
    )!
    expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport)
  },
  30_000
)

test('the sidebar stays below the header while the page scrolls', async () => {
  await open('/overview', 1920)
  window.scrollTo(0, 600)
  await frame()
  expect(Math.round(rect('[data-slot="sidebar-container"]').top)).toBe(64)
  window.scrollTo(0, 0)
})

test('the home page header uses the same frame as the documentation', async () => {
  const viewport = await open('/', 1920)
  const home = rect('header > div')
  expect(Math.abs(home.left - (viewport - home.right))).toBeLessThanOrEqual(1)
  expect(home.width).toBe(FRAME)
})
