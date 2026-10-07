import { expect } from 'vitest'
import { userEvent } from 'vitest/browser'

/**
 * Presses Tab (Shift+Tab with `back`) until the focused element matches
 * `css`, as a keyboard user does, and returns it. Fails after `max` presses.
 */
export const tabTo = async (
  css: string,
  { back = false, max = 80 }: { back?: boolean; max?: number } = {}
) => {
  for (let i = 0; i < max; i++) {
    await userEvent.keyboard(back ? '{Shift>}{Tab}{/Shift}' : '{Tab}')
    const active = document.activeElement
    if (active instanceof HTMLElement && active.matches(css)) {
      return active
    }
  }
  expect.fail(`no focus stop matching ${css} within ${max} presses`)
}
