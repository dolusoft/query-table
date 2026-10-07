import { expect, test } from 'vitest'
import { render } from 'vitest-browser-vue'

import '../../apps/playground/playground.css'
import App from '../../apps/playground/App.vue'
import { router } from '../../apps/playground/router'
import { expectNoPageOverflow } from '../support/touch'

// The Features page on a phone (the touch instance of the browser project:
// 390x844, a touch screen). Six columns do not fit: each table scrolls in
// its own box and the page does not. A repository path breaks after a
// slash, never inside a name.

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

const open = async () => {
  await router.push('/features')
  await router.isReady()
  await render(App, { global: { plugins: [router] } })
  await expect
    .poll(() => document.querySelectorAll('article table').length, {
      timeout: 5000
    })
    .toBe(4)
  await frame()
  await frame()
}

test('on a phone only the table box scrolls, not the page', async () => {
  await open()
  expectNoPageOverflow()
  for (const section of document.querySelectorAll('article > section')) {
    const box = section.querySelector('[data-feature-table]')!
    const scroller = section.querySelector<HTMLElement>(
      '[data-slot="table-container"]'
    )!
    expect(box.getBoundingClientRect().right).toBeLessThanOrEqual(
      window.innerWidth
    )
    expect(getComputedStyle(scroller).overflowX).toBe('auto')
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
    expect(scroller.getAttribute('tabindex')).toBe('0')
  }
})

test('a repository path breaks after a slash only', async () => {
  await open()
  const link = [
    ...document.querySelectorAll<HTMLAnchorElement>('article td a')
  ].find(anchor => anchor.textContent === 'docs/guide/protocol.md')!
  expect(link).toBeDefined()
  const range = document.createRange()
  const parts = [...link.childNodes].filter(
    node => node.nodeType === Node.TEXT_NODE && node.textContent
  )
  expect(parts.map(part => part.textContent)).toEqual([
    'docs/',
    'guide/',
    'protocol.md'
  ])
  // Each part sits on one line: no break inside a name.
  for (const part of parts) {
    range.selectNodeContents(part)
    expect(range.getClientRects()).toHaveLength(1)
  }
})
