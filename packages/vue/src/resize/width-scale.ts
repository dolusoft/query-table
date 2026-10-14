// Between the width a column is declared with and the width it is drawn at
// (C-49, C-50).

import { styleSwap } from './measure-widths'

/** How a column's declared width maps to the width it is drawn at. */
export interface WidthScale {
  /** The declared width that draws the column `rendered` pixels wide. */
  declared: (rendered: number) => number
  /** The width the column is drawn at with the `declared` width. */
  rendered: (declared: number) => number
}

const same = (width: number) => width

const sum = (widths: number[]) => widths.reduce((a, b) => a + b, 0)

/** The declared width is the drawn one. */
export const identityScale: WidthScale = { declared: same, rendered: same }

/**
 * A table whose cells take `space` (a container's width, with
 * `min-width: 100%`) and whose columns are declared narrower: the fixed
 * layout spreads the rest over the columns by their declared widths, so a
 * column declared `w` next to `others` is drawn `w * space / (w + others)`
 * wide until the columns fill the space, and `w` from there on. With no other
 * column the one column takes the space whatever its width: the identity.
 */
export const stretchedScale = (space: number, others: number): WidthScale =>
  others > 0 && space > others
    ? {
        declared: rendered =>
          rendered >= space - others
            ? rendered
            : (rendered * others) / (space - rendered),
        rendered: declared =>
          declared + others >= space
            ? declared
            : (declared * space) / (declared + others)
      }
    : identityScale

/**
 * How the declared width of the column of `th` maps to its drawn width, read
 * from the layout. The column is drawn once at the width it is drawn at now.
 * Wider there, the table stretches it: its row's cells take the whole space,
 * and the other columns' declared widths follow from the stretch; the fit
 * must then give back the width the column is drawn at now. Not wider, the
 * column is drawn once more at `low`, the narrowest width a resize writes. A
 * table that stretches it there widens every cell of the row by one factor,
 * the column at least as much (content the fixed layout keeps wider than
 * `low` only adds to it), and its cells then take the space the columns can
 * shrink into before the table stretches them. Any other layout gets the
 * identity: one that never stretches, a column without a width that takes
 * what is left, one that spreads the space otherwise. Every style is put back before the
 * function returns (C-31), so nothing is painted in between.
 */
export const measureWidthScale = (th: HTMLElement, low: number): WidthScale => {
  const now = th.getBoundingClientRect().width
  const others = Array.from(th.parentElement?.children ?? []).filter(
    cell => cell !== th
  )
  const widths = () => others.map(cell => cell.getBoundingClientRect().width)
  const swap = styleSwap()
  /** Draws the column `width` wide; the width it takes. */
  const draw = (width: number) => {
    swap.set(th, 'width', `${width}px`)
    return th.getBoundingClientRect().width
  }
  try {
    const drawn = draw(now)
    const before = widths()
    const rest = sum(before)
    if (drawn > now + 0.5) {
      const space = drawn + rest
      const scale = stretchedScale(space, (now * rest) / drawn)
      return Math.abs(draw(scale.declared(now)) - now) <= 1
        ? scale
        : identityScale
    }
    const narrow = draw(low)
    const after = widths()
    const factor = sum(after) / rest
    const stretched =
      factor > 1 &&
      narrow >= low * factor - 1 &&
      after.every((width, i) => Math.abs(width - before[i] * factor) <= 1)
    return stretched ? stretchedScale(narrow + sum(after), rest) : identityScale
  } finally {
    swap.restore()
  }
}
