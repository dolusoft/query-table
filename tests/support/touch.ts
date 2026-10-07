import { expect } from 'vitest'
import { commands, page } from 'vitest/browser'

// Helpers of the touch specs (`*.touch.spec.ts`, the touch instance of the
// browser project). The `tap` command itself runs in Node:
// touch-commands.ts.

/** Taps the element `css` selects, as a finger does. */
export const tap = (css: string) => commands.tap(page.getByCSS(css).selector)

/** The page never scrolls sideways; the table scrolls in its own box. */
export const expectNoPageOverflow = () => {
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    window.innerWidth
  )
  expect(document.body.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
}
