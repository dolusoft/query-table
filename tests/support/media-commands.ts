import type { BrowserCommand } from 'vitest/node'

// Browser commands that emulate a media feature on the Playwright page, for
// the specs of a skin's `prefers-reduced-motion` and `print` rules (C-94).
// They run in Node; `null` hands the feature to the operating system (a
// system with animations off reports `reduce`), so a spec puts back
// Playwright's defaults, `screen` and `no-preference`, instead.

interface MediaOptions {
  media?: 'screen' | 'print' | null
  reducedMotion?: 'reduce' | 'no-preference' | null
}

interface PlaywrightPage {
  emulateMedia: (options: MediaOptions) => Promise<void>
}

const emulateMedia: BrowserCommand<[options: MediaOptions]> = async (
  context,
  options
) => {
  await (context as unknown as { page: PlaywrightPage }).page.emulateMedia(
    options
  )
}

export const mediaCommands = { emulateMedia }

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateMedia: (options: MediaOptions) => Promise<void>
  }
}
