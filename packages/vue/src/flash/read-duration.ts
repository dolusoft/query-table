/** The custom property a skin sets the flash duration with (C-94). */
export const durationProperty = '--qt-flash-duration'

/**
 * A CSS time in milliseconds: `250ms`, `2s`, `.5s`. Anything else (a
 * missing value, `calc()`, a negative or a zero time, a number without a
 * unit) is `0`: no flash.
 */
export const parseDuration = (text: string): number => {
  const match = /^\s*(\d*\.?\d+(?:e[+-]?\d+)?)(ms|s)\s*$/i.exec(text)
  if (!match) {
    return 0
  }
  const value = Number(match[1]) * (match[2].toLowerCase() === 's' ? 1000 : 1)
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * The flash duration the skin set on the table root (`.qt-datatable`) or
 * above it, in milliseconds; `0` without one. One style read: the caller
 * reads it at most once a frame, and only for an update that marks
 * something (C-94).
 */
export const readDuration = (table: Element | null): number => {
  const root = table?.closest('.qt-datatable')
  if (!root) {
    return 0
  }
  return parseDuration(
    getComputedStyle(root).getPropertyValue(durationProperty)
  )
}
