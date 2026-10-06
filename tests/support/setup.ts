import { locators, type Locator } from 'vitest/browser'

import '../../apps/playground/skin/test-skin.css'
import { setTheme, themeFromUrl } from '../../apps/playground/harness/theme'

// `?theme=light` or `?theme=dark` on the test page pins the skin's theme, for
// looking at the table in either one; without it the OS decides.
setTheme(themeFromUrl())

// The library ships no CSS. The browser tests style the table with the test
// skin (shadcn-vue + Tailwind, see gen-skin.ts), so geometry is measured on a
// realistic layout and the screenshots are worth looking at.

// The table has few accessible names to hang role locators on; its stable
// addresses are `th[data-field]` and `qt-*` classes, so tests use CSS.
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
