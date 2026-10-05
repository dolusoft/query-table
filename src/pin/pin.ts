/** Geometry key of a utility cell; a column's key is its `field`. */
export const utilityKey = (utility: string) => `utility:${utility}`

/**
 * Attributes of a pinned cell (C-47): `data-pinned` and, once measured, the
 * `--qt-pin-left` offset in pixels, next to an optional `width`. Nothing but
 * the width for a cell that is not pinned; no `style` when both are absent.
 */
export const pinAttrs = (
  pinned: boolean,
  offset: number | undefined,
  width?: string
): Record<string, unknown> => {
  const style: Record<string, string> = {}
  if (width) {
    style.width = width
  }
  if (pinned && offset !== undefined) {
    style['--qt-pin-left'] = `${offset}px`
  }
  return {
    'data-pinned': pinned ? '' : undefined,
    style: width || style['--qt-pin-left'] ? style : undefined
  }
}
