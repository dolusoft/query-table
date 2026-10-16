import type { BrowserCommand } from 'vitest/node'

// A browser command that reads the accessibility tree of an element on the
// page under test as Playwright's ARIA snapshot (YAML: one line per role and
// name), for the spec of the roles of `scrollBody` (C-102). It runs in Node.

interface Locator {
  ariaSnapshot: () => Promise<string>
}

const ariaSnapshot: BrowserCommand<[selector: string]> = async (
  context,
  selector
) =>
  (context as unknown as { iframe: { locator: (s: string) => Locator } }).iframe
    .locator(selector)
    .ariaSnapshot()

export const ariaCommands = { ariaSnapshot }

declare module 'vitest/browser' {
  interface BrowserCommands {
    ariaSnapshot: (selector: string) => Promise<string>
  }
}
