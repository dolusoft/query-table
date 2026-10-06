import {
  nextTick,
  onBeforeUnmount,
  shallowRef,
  watch,
  type ShallowRef
} from 'vue'

import type { PinSide } from '../columns/column-layout'

/** A drawn header cell, in order: its key (`field`, or the utility) and side. */
interface HeaderCellKey {
  key: string
  side: PinSide
}

export interface HeaderGeometryOptions {
  /** The `table` element once it is mounted. */
  table: ShallowRef<HTMLTableElement | null>
  /** The header cells as drawn: utilities first, then the columns. */
  cells: () => HeaderCellKey[]
  /** Some column is pinned on either side (C-46, C-71) or has a resize handle (C-48). */
  active: () => boolean
}

type Numbers = Readonly<Record<string, number>>

/** One string per map: compares two maps in one step. */
const signature = (numbers: Numbers) => JSON.stringify(numbers)

/**
 * Measured header geometry (C-47, C-48, C-71): the rendered width of every
 * header cell and, for the pinned cells, the cumulative offset: from the left
 * for a left-pinned cell (`--qt-pin-left`), from the right for a
 * right-pinned one (`--qt-pin-right`). One `ResizeObserver` watches the header cells and the
 * table; it reports width changes from any cause (a resize, a font that
 * loads, a container that narrows) in one batched callback, after layout, so
 * reading the cells there forces no extra layout. The observer is rebuilt
 * only when the drawn cells change, not when a width does. Nothing is
 * measured while inactive, and the observer is disconnected on unmount.
 */
export const useHeaderGeometry = (options: HeaderGeometryOptions) => {
  /** Rendered width of each header cell, by key. */
  const widths = shallowRef<Numbers>({})
  /** Rendered width of the table. */
  const tableWidth = shallowRef(0)
  /**
   * `--qt-pin-left` of each left-pinned cell and `--qt-pin-right` of each
   * right-pinned one, by key, in pixels.
   */
  const offsets = shallowRef<Numbers>({})
  let observer: ResizeObserver | null = null

  const headerCells = (table: HTMLTableElement) =>
    table.querySelectorAll(':scope > thead > tr > *')

  const measure = (table: HTMLTableElement) => {
    tableWidth.value = table.getBoundingClientRect().width
    const cells = options.cells()
    const next: Record<string, number> = {}
    const nextOffsets: Record<string, number> = {}
    const rights: Array<[string, number]> = []
    let left = 0
    headerCells(table).forEach((cell, index) => {
      const drawn = cells[index]
      if (drawn) {
        const width = cell.getBoundingClientRect().width
        next[drawn.key] = width
        if (drawn.side === 'left') {
          nextOffsets[drawn.key] = left
          left += width
        } else if (drawn.side === 'right') {
          rights.push([drawn.key, width])
        }
      }
    })
    // Right offsets add up from the right edge: the last cell is at 0.
    let right = 0
    for (let i = rights.length - 1; i >= 0; i--) {
      const [key, width] = rights[i]
      nextOffsets[key] = right
      right += width
    }
    // Only a real change re-renders the cells that read these.
    if (signature(next) !== signature(widths.value)) {
      widths.value = next
    }
    if (signature(nextOffsets) !== signature(offsets.value)) {
      offsets.value = nextOffsets
    }
  }

  const observe = () => {
    observer?.disconnect()
    observer = null
    const table = options.table.value
    if (!table || !options.active() || typeof ResizeObserver === 'undefined') {
      if (Object.keys(offsets.value).length > 0) {
        offsets.value = {}
      }
      return
    }
    const current = new ResizeObserver(() => {
      measure(table)
    })
    observer = current
    current.observe(table)
    headerCells(table).forEach(cell => {
      current.observe(cell)
    })
    measure(table)
  }

  // Re-observe once the drawn cells change (columns, order, pinning,
  // utilities), after they are rendered. A width written back does not
  // change this key, so it does not rebuild the observer.
  watch(
    [
      // A getter, not the ref: a shallow ref among the sources forces the
      // callback on every trigger, rebuilding the observer for nothing.
      () => options.table.value,
      options.active,
      () =>
        options
          .cells()
          .map(cell =>
            cell.side === 'left'
              ? `${cell.key}*`
              : cell.side === 'right'
                ? `${cell.key}>`
                : cell.key
          )
          .join('|')
    ],
    () => {
      void nextTick(observe)
    },
    { immediate: true, flush: 'post' }
  )

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { widths, tableWidth, offsets }
}
