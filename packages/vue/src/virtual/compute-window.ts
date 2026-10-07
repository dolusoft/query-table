// The pure part of the virtual body (C-83, C-84): which items to draw for a
// scroll position, and how the drawn items and the spacers between them line
// up. No DOM here; `use-row-window.ts` feeds it measured numbers.

/** A half-open range of item positions: `start` drawn, `end` not. */
export interface WindowRange {
  start: number
  end: number
}

export interface WindowInput {
  /**
   * The top of every item from the top of the first one, and last the total
   * height: `count + 1` numbers, never decreasing.
   */
  offsets: ArrayLike<number>
  /** The top of the view, from the top of the first item. May be negative. */
  scrollTop: number
  viewportHeight: number
  /** Items drawn beyond each edge of the view. */
  overscan: number
}

/**
 * Fills `offsets` from `heights`, starting at position `from` (the offsets
 * before it are kept): `offsets[i + 1] = offsets[i] + heights[i]`.
 */
export const fillOffsets = (
  heights: ArrayLike<number>,
  offsets: Float64Array,
  from = 0
): void => {
  for (let i = from; i < heights.length; i++) {
    offsets[i + 1] = offsets[i] + heights[i]
  }
}

/**
 * The item that holds the point `y`: the last position whose top is at most
 * `y`, clamped to the items (0 for a point above them, the last item for a
 * point below them). `-1` when there is no item.
 */
export const indexAt = (offsets: ArrayLike<number>, y: number): number => {
  let low = 0
  let high = offsets.length - 2
  if (high < 0) {
    return -1
  }
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (offsets[mid] <= y) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return low
}

/** The items to draw: the ones in view and `overscan` more on each side. */
export const computeWindow = ({
  offsets,
  scrollTop,
  viewportHeight,
  overscan
}: WindowInput): WindowRange => {
  const count = offsets.length - 1
  if (count <= 0) {
    return { start: 0, end: 0 }
  }
  const first = indexAt(offsets, scrollTop)
  const bottom = scrollTop + Math.max(0, viewportHeight)
  let last = indexAt(offsets, bottom)
  // An item that starts exactly at the bottom edge is not in view.
  if (last > first && offsets[last] >= bottom) {
    last -= 1
  }
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(count, last + 1 + overscan)
  }
}

/** A run of drawn items, or a spacer that stands for the items left out. */
export type Segment =
  { from: number; to: number } | { spacer: number; slot: 0 | 1 | 2 }

/**
 * The body between the pinned rows: an upper spacer, the drawn items and a
 * lower spacer. A `kept` item outside the range (it holds the focus, C-86)
 * is drawn on its own, with a spacer of its own between it and the range.
 * Spacers of height 0 are left out. `slot` names a spacer's place, so a
 * spacer keeps its identity while its height changes.
 */
export const segmentsOf = (
  offsets: ArrayLike<number>,
  range: WindowRange,
  kept: number | null
): Segment[] => {
  const count = offsets.length - 1
  const total = count > 0 ? offsets[count] : 0
  const out: Segment[] = []
  const spacer = (height: number, slot: 0 | 1 | 2) => {
    if (height > 0) {
      out.push({ spacer: height, slot })
    }
  }
  const run = (from: number, to: number) => {
    if (to > from) {
      out.push({ from, to })
    }
  }
  const { start, end } = range
  if (kept !== null && kept >= 0 && kept < start) {
    spacer(offsets[kept], 0)
    run(kept, kept + 1)
    spacer(offsets[start] - offsets[kept + 1], 1)
    run(start, end)
    spacer(total - offsets[end], 2)
  } else if (kept !== null && kept >= end && kept < count) {
    spacer(offsets[start], 0)
    run(start, end)
    spacer(offsets[kept] - offsets[end], 1)
    run(kept, kept + 1)
    spacer(total - offsets[kept + 1], 2)
  } else {
    spacer(offsets[start], 0)
    run(start, end)
    spacer(total - offsets[end], 2)
  }
  return out
}
