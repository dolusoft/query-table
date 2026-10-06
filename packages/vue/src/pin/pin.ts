import type { PinSide } from '../columns/column-layout'

/**
 * Cells before the first column, in drawing order: the right panel, the
 * expand button, the selection checkbox.
 */
export type Utility = 'right-panel' | 'subtable' | 'select'

/** Geometry key of a utility cell; a column's key is its `field`. */
export const utilityKey = (utility: string) => `utility:${utility}`

/**
 * Attributes of a pinned cell (C-47, C-71): `data-pinned` (`''` on the left,
 * `'right'` on the right) and, once measured, the `--qt-pin-left` or
 * `--qt-pin-right` offset in pixels, next to an optional `width`. Nothing but
 * the width for a cell that is not pinned; no `style` when both are absent.
 */
export const pinAttrs = (
  side: PinSide,
  offset: number | undefined,
  width?: string
): Record<string, unknown> => {
  const style: Record<string, string> = {}
  if (width) {
    style.width = width
  }
  if (side && offset !== undefined) {
    style[side === 'left' ? '--qt-pin-left' : '--qt-pin-right'] = `${offset}px`
  }
  return {
    'data-pinned':
      side === 'left' ? '' : side === 'right' ? 'right' : undefined,
    style: Object.keys(style).length > 0 ? style : undefined
  }
}
