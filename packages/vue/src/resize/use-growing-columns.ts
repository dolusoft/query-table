import {
  computed,
  onBeforeUnmount,
  shallowRef,
  watch,
  type ShallowRef
} from 'vue'

import type { Column } from '../contract'
import { baseAt, divideRoom, type GrowingColumn } from './grow-shares'
import { styleSwap } from './measure-widths'
import { limitOf, minWidthOf } from './use-column-resize'

// Replaced by the consumer's bundler, just as in Vue's esm-bundler build.
declare const process: { env: { NODE_ENV?: string } }

// A try/catch keeps the constant replacement in production builds.
const isDevelopment = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production'
  } catch {
    return true
  }
}

export interface GrowingColumnsOptions {
  /** With the header only: the shares are drawn on its cells (K321-6). */
  enabled: () => boolean
  /** The table of the header cells; its parent is the container (K321-2). */
  table: ShallowRef<HTMLTableElement | null>
  /** The visible columns, in drawing order. */
  columns: () => Column[]
  /** The `autoWidth` prop. */
  autoWidth: () => boolean
  /** The automatic widths of the columns without a width (C-100). */
  autoWidths: () => Readonly<Record<string, number>>
  /** The utility cells drawn; a change reads the table again. */
  utilities: () => string
  /** The column a resize drags and its drawn width (C-49), or `null`. */
  preview: () => { field: string; width: number } | null
}

/** `Column.grow` when it is a weight above `0`, else `0` (K321-1). */
export const growOf = (column: Column) =>
  typeof column.grow === 'number' &&
  Number.isFinite(column.grow) &&
  column.grow > 0
    ? column.grow
    : 0

/** A CSS length in pixels (`'180px'`), else `undefined`. */
const pixels = (width: string | undefined) => {
  const match = width === undefined ? null : /^(\d+(?:\.\d+)?)px$/.exec(width)
  return match ? Number(match[1]) : undefined
}

interface Reading {
  /** The table's width at the bases, without shares. */
  natural: number
  /** Each header cell's drawn width in that read, by `field`. */
  drawn: Readonly<Record<string, number>>
}

const none: Readonly<Record<string, number>> = Object.freeze({})

/** The content width of the container: inside its scrollbar and padding. */
const innerWidth = (element: HTMLElement) => {
  const style = getComputedStyle(element)
  return (
    element.clientWidth -
    (Number.parseFloat(style.paddingLeft) || 0) -
    (Number.parseFloat(style.paddingRight) || 0)
  )
}

/**
 * Growing columns (C-132, ADR 0024). The room of a container wider than the
 * table goes to the columns with `grow`, by their weights, on top of their
 * bases; the table is then as wide as the container and the browser spreads
 * nothing. The shares are UI state (P2): drawn as the header cell's `width`,
 * never emitted, never written to `columns`. The table reads its natural
 * width once per change of its columns; a change of the container's width
 * only divides the room again.
 */
export const useGrowingColumns = (options: GrowingColumnsOptions) => {
  const reading = shallowRef<Reading | null>(null)
  const container = shallowRef(0)
  /** A read found the table not displayed: read once it is. */
  let waiting = false
  let warned = false
  let observer: ResizeObserver | null = null

  const growing = () => options.columns().filter(column => growOf(column) > 0)

  /**
   * K321-9: a visible column that does not grow and has no width, given or
   * automatic, takes what is left in a fixed layout, so no share is drawn.
   */
  const blocked = () => {
    const auto = options.autoWidths()
    return options
      .columns()
      .some(
        column =>
          growOf(column) === 0 &&
          !column.width &&
          auto[column.field] === undefined
      )
  }

  /**
   * The width `column` is drawn at in the read, a growing one at its base, in
   * pixels. Drawn, not declared: a skin's own limits (a `min-width` on the
   * header cells) can draw a column wider than declared, and the room is
   * what the drawn widths leave. Its declared width when it has no box.
   */
  const drawnOf = (column: Column, read: Reading) =>
    read.drawn[column.field] ??
    pixels(column.width) ??
    options.autoWidths()[column.field] ??
    (growOf(column) > 0 ? minWidthOf(column) : 0)

  /** The width a growing column is read at: its base (K321-3). */
  const baseCss = (column: Column) => {
    if (column.width) {
      return column.width
    }
    const auto = options.autoWidths()[column.field]
    return `${auto ?? minWidthOf(column)}px`
  }

  const clear = () => {
    reading.value = null
    waiting = false
    observer?.disconnect()
    observer = null
  }

  const read = () => {
    const table = options.table.value
    const parent = table?.parentElement
    if (!table || !parent) {
      return
    }
    const byField = new Map(
      options.columns().map(column => [column.field, column])
    )
    const headers = Array.from(
      table.querySelectorAll<HTMLTableCellElement>(
        ':scope > thead > tr > th[data-field]'
      )
    )
    const swap = styleSwap()
    let natural = 0
    const drawn: Record<string, number> = {}
    try {
      // The table at its columns' width, the growing ones at their base;
      // put back before the function returns, so nothing is painted (P5).
      swap.set(table, 'min-width', '0')
      swap.set(table, 'width', 'max-content')
      for (const th of headers) {
        const column = byField.get(th.dataset.field ?? '')
        if (column && growOf(column) > 0) {
          swap.set(th, 'width', baseCss(column))
        }
      }
      natural = table.getBoundingClientRect().width
      for (const th of headers) {
        drawn[th.dataset.field ?? ''] = th.getBoundingClientRect().width
      }
    } finally {
      swap.restore()
    }
    const inner = innerWidth(parent)
    if (natural === 0 || inner <= 0) {
      // Not displayed: nothing has a box. Keep what is drawn.
      waiting = true
      return
    }
    waiting = false
    container.value = inner
    reading.value = { natural, drawn }
  }

  const shares = computed<Readonly<Record<string, number>>>(() => {
    const current = reading.value
    if (!current || !options.enabled()) {
      return none
    }
    let natural = current.natural
    let columns = growing()
    const preview = options.preview()
    if (preview) {
      const column = options
        .columns()
        .find(candidate => candidate.field === preview.field)
      if (column) {
        // The dragged column is drawn where the pointer is and takes no
        // share; the other growing columns take the difference (D-05).
        natural += preview.width - drawnOf(column, current)
        columns = columns.filter(candidate => candidate !== column)
      }
    }
    return divideRoom(
      container.value - natural,
      columns.map((column): GrowingColumn => ({
        field: column.field,
        weight: growOf(column),
        base: drawnOf(column, current),
        max: limitOf(column.maxWidth)
      }))
    )
  })

  /** The shares are drawn: the table is as wide as its container. */
  const active = computed(() =>
    Object.values(shares.value).some(share => share > 0)
  )

  /** The width the shares make the table: to tell a change we did not make. */
  const expected = () => {
    const current = reading.value
    if (!current) {
      return undefined
    }
    return (
      current.natural +
      Object.values(shares.value).reduce((sum, share) => sum + share, 0)
    )
  }

  const observe = (table: HTMLTableElement | null) => {
    observer?.disconnect()
    observer = null
    const parent = table?.parentElement
    if (!table || !parent || typeof ResizeObserver === 'undefined') {
      return
    }
    observer = new ResizeObserver(() => {
      if (waiting) {
        read()
        return
      }
      container.value = innerWidth(parent)
      // A width that moved under the table (a stylesheet, a font): read the
      // columns again, but never during a drag.
      const want = expected()
      if (
        want !== undefined &&
        !options.preview() &&
        Math.abs(table.getBoundingClientRect().width - want) > 1 &&
        Object.keys(shares.value).length > 0
      ) {
        read()
      }
    })
    observer.observe(parent)
    observer.observe(table)
  }

  watch(
    [
      () => options.enabled(),
      () => options.table.value,
      () =>
        options
          .columns()
          .map(column =>
            [
              column.field,
              column.width ?? '',
              growOf(column),
              column.minWidth ?? '',
              column.maxWidth ?? ''
            ].join(' ')
          )
          .join('|'),
      () => JSON.stringify(options.autoWidths()),
      () => options.utilities()
    ],
    ([enabled, table], [, oldTable]) => {
      if (!enabled || growing().length === 0) {
        clear()
        return
      }
      if (blocked()) {
        clear()
        if (!options.autoWidth() && !warned && isDevelopment()) {
          warned = true
          // oxlint-disable-next-line no-console -- development-only warning to the library user
          console.warn(
            '[QueryTable] `grow`: a visible column that does not grow has no `width`, so the room is not divided. Give that column a `width` or turn `autoWidth` on (C-132).'
          )
        }
        return
      }
      if (table !== oldTable || !observer) {
        observe(table)
      }
      read()
    },
    { immediate: true, flush: 'post' }
  )

  /** The width a column is drawn at, or `undefined` to draw it as declared. */
  const widthOf = (field: string) => {
    const share = shares.value[field]
    const current = reading.value
    if (!share || !current) {
      return undefined
    }
    const column = options
      .columns()
      .find(candidate => candidate.field === field)
    return column ? drawnOf(column, current) + share : undefined
  }

  /**
   * The width a resize of `field` emits for the drawn width `drawn`: the base
   * that keeps a growing column there once the room is divided again (D-05),
   * else `drawn`.
   */
  const emitted = (field: string, drawn: number) => {
    const current = reading.value
    const column = options
      .columns()
      .find(candidate => candidate.field === field)
    if (!current || !column || growOf(column) === 0 || !active.value) {
      return drawn
    }
    const all = growing()
    const base = drawnOf(column, current)
    return baseAt(
      drawn,
      container.value - (current.natural - base),
      growOf(column),
      all.reduce((sum, candidate) => sum + growOf(candidate), 0)
    )
  }

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { shares, active, widthOf, emitted }
}

export type GrowingColumns = ReturnType<typeof useGrowingColumns>
