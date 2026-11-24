// How the room of a wide container is divided among the growing columns
// (C-132, ADR 0024). No DOM: the widths come in measured.

/** A growing column, in drawing order. */
export interface GrowingColumn {
  field: string
  /** `Column.grow`, above `0`. */
  weight: number
  /** The declared width it grows from, in pixels (K321-3). */
  base: number
  /** `Column.maxWidth` when it is one, in pixels. */
  max?: number
}

/**
 * The share of `room` each growing column takes, by `field`, in whole
 * pixels (K321-2). The room is divided by the weights; a column that would
 * pass its `max` stops there and the others divide what it leaves, as
 * flexbox does. Each share is rounded down and the pixels the rounding
 * leaves go to the last column that is not at its `max`, so the shares add up
 * to the whole pixels of the room. When every column is at its `max`, what is
 * left is not given out. No room, no shares.
 */
export const divideRoom = (
  room: number,
  columns: readonly GrowingColumn[]
): Record<string, number> => {
  const shares: Record<string, number> = {}
  if (!(room >= 1) || columns.length === 0) {
    return shares
  }
  const exact = new Map<string, number>()
  let open = columns.filter(column => column.weight > 0)
  let left = room
  for (;;) {
    const total = open.reduce((sum, column) => sum + column.weight, 0)
    const capped = open.find(
      column =>
        column.max !== undefined &&
        column.base + (left * column.weight) / total > column.max
    )
    if (!capped) {
      for (const column of open) {
        exact.set(column.field, (left * column.weight) / total)
      }
      break
    }
    const share = Math.max(0, (capped.max ?? capped.base) - capped.base)
    exact.set(capped.field, share)
    left -= share
    open = open.filter(column => column !== capped)
    if (open.length === 0) {
      break
    }
  }
  let given = 0
  for (const column of columns) {
    const share = Math.floor(exact.get(column.field) ?? 0)
    shares[column.field] = share
    given += share
  }
  const last = open.at(-1)
  if (last) {
    const whole = Math.floor(
      [...exact.values()].reduce((sum, share) => sum + share, 0)
    )
    shares[last.field] += Math.max(0, whole - given)
  }
  return shares
}

/**
 * The base that draws a growing column `drawn` pixels wide once the room is
 * divided again with it growing (ADR 0024, amendment, #136 D-05). `room` is
 * the room with the column's base taken out, `weight` its weight and `total`
 * the weights of every growing column. Alone, or wider than the room, the
 * column's base is the drawn width; the other columns' `max` is not solved
 * for.
 */
export const baseAt = (
  drawn: number,
  room: number,
  weight: number,
  total: number
): number =>
  total - weight <= 0 || drawn > room
    ? drawn
    : (drawn * total - room * weight) / (total - weight)
