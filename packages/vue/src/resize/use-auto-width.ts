import {
  cloneQuery,
  isCursorQuery,
  sameQuery,
  type Query
} from '@dolusoft/query-protocol'
import type { RowsUpdate } from '@dolusoft/query-table-core/row-changes'
import { onBeforeUnmount, shallowRef, watch, type ShallowRef } from 'vue'

import type { Column } from '../contract'
import { measureColumnWidths } from './measure-widths'
import { clampWidth, limitOf } from './use-column-resize'

export interface AutoWidthOptions {
  /** The `autoWidth` prop. */
  enabled: () => boolean
  /** The `autoWidthMax` prop: the limit of a column without `maxWidth`. */
  max: () => number | undefined
  table: ShallowRef<HTMLTableElement | null>
  /** With `scrollBody`: the table of the body rows (C-101), else `null`. */
  body: () => HTMLTableElement | null
  /** The visible columns, as given. */
  columns: () => Column[]
  rows: () => readonly unknown[]
  query: () => Query
  rowsUpdate: () => RowsUpdate | undefined
}

type Widths = Readonly<Record<string, number>>

/**
 * The query without what moves inside one result: the paging position, the
 * page size and the sort. Two queries alike in the rest ask for the same
 * rows, in another order or slice (C-100).
 */
const resultOf = (query: Query): Query =>
  isCursorQuery(query)
    ? { ...query, cursor: null, pageSize: 0, sort: null }
    : { ...query, page: 1, pageSize: 0, sort: null }

const sameWidths = (a: Widths, b: Widths) => {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every(key => a[key] === b[key])
  )
}

const none: Widths = Object.freeze({})

/**
 * Automatic column widths (C-100, ADR 0014). With `autoWidth`, every visible
 * column without `Column.width` is measured (C-99) after the drawn rows
 * change, clamped as a resize is (C-49), and drawn at that width. The widths
 * are UI state (P2): never emitted, never written to `columns`, gone when
 * `autoWidth` is off or the column gets a width. Within one result (the query
 * apart from its paging position, page size and sort) they only grow, so a
 * page, a sort or a live tick never narrows a column.
 */
export const useAutoWidth = (options: AutoWidthOptions) => {
  const widths = shallowRef<Widths>(none)
  /** The result the widths were last measured for, `null` before one. */
  let result: Query | null = null
  /** The next measure starts over: the result moved before it could run. */
  let fromScratch = false
  /** A measure found the table not displayed: measure once it is. */
  let waiting = false
  let observer: ResizeObserver | null = null

  const autoColumns = () => options.columns().filter(column => !column.width)

  const clear = () => {
    widths.value = none
    result = null
    fromScratch = false
    waiting = false
    observer?.disconnect()
    observer = null
  }

  const measure = (rowsChanged: boolean) => {
    const table = options.table.value
    const columns = autoColumns()
    if (!table || columns.length === 0) {
      return
    }
    const query = options.query()
    const moved =
      result === null ||
      (rowsChanged &&
        (options.rowsUpdate() === 'reset' ||
          !sameQuery(resultOf(result), resultOf(query))))
    if (moved) {
      fromScratch = true
      result = cloneQuery(query)
    }
    if (options.rows().length === 0) {
      return
    }
    const measured = measureColumnWidths(
      table,
      columns.map(column => column.field),
      options.body(),
      // The filter row is a floor: a column never draws its filter
      // unusable (C-100).
      { filters: true }
    )
    if (Object.keys(measured).length === 0) {
      // Not displayed: nothing has a box. Keep what is drawn.
      waiting = true
      return
    }
    waiting = false
    const previous = widths.value
    const next: Record<string, number> = {}
    for (const column of columns) {
      const width = measured[column.field]
      if (width === undefined) {
        continue
      }
      const fitted = clampWidth(
        { ...column, maxWidth: limitOf(column.maxWidth) ?? options.max() },
        width
      )
      next[column.field] = fromScratch
        ? fitted
        : Math.max(fitted, previous[column.field] ?? 0)
    }
    fromScratch = false
    if (!sameWidths(next, previous)) {
      widths.value = next
    }
  }

  const observe = (table: HTMLTableElement | null) => {
    observer?.disconnect()
    observer = null
    if (!table || typeof ResizeObserver === 'undefined') {
      return
    }
    observer = new ResizeObserver(() => {
      if (waiting) {
        measure(false)
      }
    })
    observer.observe(table)
  }

  watch(
    [
      // Getters, not the refs: a shallow ref among the sources forces the
      // callback on every trigger.
      () => options.enabled(),
      () => options.max(),
      () => options.table.value,
      () => options.rows(),
      () =>
        autoColumns()
          .map(column => column.field)
          .join('|')
    ],
    // The first call gets `[]`: every old value is `undefined`.
    ([enabled, max, table, rows], [wasEnabled, oldMax, oldTable, oldRows]) => {
      if (!enabled) {
        if (wasEnabled) {
          clear()
        }
        return
      }
      if (!wasEnabled || max !== oldMax) {
        fromScratch = true
      }
      if (table !== oldTable || !wasEnabled) {
        observe(table)
      }
      measure(rows !== oldRows)
    },
    { immediate: true, flush: 'post' }
  )

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { widths }
}
