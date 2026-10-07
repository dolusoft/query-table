import type { BrowserCommand } from 'vitest/node'

// Browser commands of the touch specs (`*.touch.spec.ts`). They run in Node,
// on the Playwright page; the spec passes the `selector` of a locator.
// `userEvent` has no tap: a tap is a touch start and end, after which the
// browser sends the pointer, mouse and click events a finger gives.
// Playwright taps only in a context with `hasTouch` (the touch instance of
// the browser project, vitest.config.ts).

const tap: BrowserCommand<[selector: string]> = async (context, selector) => {
  await context.iframe.locator(selector).tap()
}

export const touchCommands = { tap }

declare module 'vitest/browser' {
  interface BrowserCommands {
    tap: (selector: string) => Promise<void>
  }
}
