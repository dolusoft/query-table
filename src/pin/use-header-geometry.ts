import {
  nextTick,
  onBeforeUnmount,
  shallowRef,
  watch,
  type ShallowRef
} from 'vue'

import type { ColumnEntry, Utility } from '../core/use-columns'

export interface HeaderGeometryOptions {
  /** The `table` element once it is mounted. */
  table: ShallowRef<HTMLTableElement | null>
  entries: () => ColumnEntry[]
  utilities: () => Utility[]
  /** Some visible column is pinned (C-46). */
  hasPinned: () => boolean
  /** Some header cell has a resize handle (C-48). */
  resizable: () => boolean
}

/** Key of a header cell: the column `field`, or the utility it holds. */
export const utilityKey = (utility: Utility) => `utility:${utility}`

type Numbers = Readonly<Record<string, number>>

const sameNumbers = (a: Numbers, b: Numbers) => {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every(key => a[key] === b[key])
  )
}

/**
 * Measured header geometry (C-47, C-48): the rendered width of every header
 * cell and, for the pinned cells, the cumulative left offset written as
 * `--qt-pin-left`. One `ResizeObserver` watches the header cells; it reports
 * width changes from any cause (a resize, a font that loads, a container that
 * narrows) in one batched callback, after layout, so reading the cells there
 * forces no extra layout. A change of the drawn columns re-observes the cells
 * after the render. Nothing is measured while no column is pinned or
 * resizable, and the observer is disconnected on unmount.
 */
export const useHeaderGeometry = (options: HeaderGeometryOptions) => {
  /** Rendered width of each header cell, by key; `table` is the table's. */
  const widths = shallowRef<Numbers>({})
  /** `--qt-pin-left` of each pinned cell, by key, in pixels. */
  const offsets = shallowRef<Numbers>({})
  let observer: ResizeObserver | null = null

  const headerCells = (): HTMLTableCellElement[] => {
    const row = options.table.value?.querySelector(':scope > thead > tr')
    return row
      ? [...row.querySelectorAll<HTMLTableCellElement>(':scope > th')]
      : []
  }

  const keyOf = (cell: HTMLTableCellElement, index: number) =>
    cell.dataset.field ??
    (options.utilities()[index] ? utilityKey(options.utilities()[index]) : '')

  const measure = () => {
    const table = options.table.value
    if (!table) {
      return
    }
    const next: Record<string, number> = {
      table: table.getBoundingClientRect().width
    }
    headerCells().forEach((cell, index) => {
      next[keyOf(cell, index)] = cell.getBoundingClientRect().width
    })
    if (!sameNumbers(next, widths.value)) {
      widths.value = next
    }
    const pinnedKeys = options.hasPinned()
      ? [
          ...options.utilities().map(utilityKey),
          ...options
            .entries()
            .filter(entry => entry.column.pinned === 'left')
            .map(entry => entry.column.field)
        ]
      : []
    const nextOffsets: Record<string, number> = {}
    let left = 0
    for (const key of pinnedKeys) {
      nextOffsets[key] = left
      left += next[key] ?? 0
    }
    if (!sameNumbers(nextOffsets, offsets.value)) {
      offsets.value = nextOffsets
    }
  }

  const observe = () => {
    observer?.disconnect()
    observer = null
    const active = options.hasPinned() || options.resizable()
    if (!active || typeof ResizeObserver === 'undefined') {
      // Only a real change re-renders the cells that read the offsets.
      if (Object.keys(offsets.value).length > 0) {
        offsets.value = {}
      }
      return
    }
    observer = new ResizeObserver(measure)
    const table = options.table.value
    if (table) {
      observer.observe(table)
    }
    headerCells().forEach(cell => observer!.observe(cell))
    measure()
  }

  // The drawn cells change with the columns, their order, pinning and the
  // utilities: observe the new cells once they are rendered.
  watch(
    () => [
      options.table.value,
      options.entries(),
      options.utilities(),
      options.hasPinned(),
      options.resizable()
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

  return { widths, offsets }
}
