import { locators, type Locator } from 'vitest/browser'

import './test-skin.css'

// The library ships no CSS. The browser tests style the table with the test
// skin (shadcn-vue + Tailwind, see gen-skin.ts), so geometry is measured on a
// realistic layout and the screenshots are worth looking at.

// The table has few accessible names to hang role locators on; its stable
// addresses are `th[data-field]` and `bh-*` classes, so tests use CSS.
declare module 'vitest/browser' {
  interface LocatorSelectors {
    getByCSS(css: string): Locator
  }
}

locators.extend({
  getByCSS(css: string) {
    return `css=${css}`
  }
})
