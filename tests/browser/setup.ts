import FloatingVue from 'floating-vue'
import 'floating-vue/dist/style.css'
import { locators, type Locator } from 'vitest/browser'
import { config } from 'vitest-browser-vue'

// The library ships no styles and relies on the consumer registering
// floating-vue globally. The browser tests do the same and load floating-vue's
// own stylesheet so popovers get real positioning; `bh-*` classes stay unstyled.
config.global.plugins = [FloatingVue]

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
