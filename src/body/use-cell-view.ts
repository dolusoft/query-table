import type { Slots } from 'vue'

import type { CellContextMenuPayload, CellSlotProps, Column } from '../contract'
import { valueAt } from '../core/column'
import type { ColumnEntry } from '../core/use-columns'

export interface CellViewOptions<T extends object> {
  truncate: () => boolean
  maxLength: () => number
  /** The slots the body received: `cell-<field>` is looked up. */
  slots: Slots
  onContextMenu: (payload: CellContextMenuPayload<T>) => void
}

/**
 * What a body cell shows: its text (cut when `truncate` is on), its
 * attributes, the props for a `cell-<field>` slot and the context menu event
 * (C-27, C-28, C-30, C-37).
 */
export const useCellView = <T extends object>(options: CellViewOptions<T>) => {
  /**
   * Text of a cell, cut when `truncate` is on, and the full text if it was
   * cut. An `html` column is never cut: a cut can leave a tag open, and the
   * full markup is not fit for a `title`.
   */
  const cellText = (row: T, column: Column) => {
    // A cell value may be any type; its string form is what the table shows.
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const full = String(valueAt(row, column.field) ?? '')
    const max = options.maxLength()
    const cut = options.truncate() && !column.html && full.length > max
    return {
      text: cut ? full.substring(0, max) + '...' : full,
      title: cut ? full : undefined
    }
  }

  const cellAttrs = (
    row: T,
    entry: ColumnEntry,
    rowIndex: number,
    title?: string
  ) => ({
    'data-field': entry.column.field,
    'data-type': entry.type,
    title,
    onContextmenu: (event: MouseEvent) => {
      event.preventDefault()
      options.onContextMenu({
        event,
        row,
        column: entry.column,
        cellValue: valueAt(row, entry.column.field),
        rowIndex,
        columnIndex: entry.index
      })
    }
  })

  const hasCellSlot = (column: Column) =>
    !!options.slots[`cell-${column.field}`]

  const slotProps = (
    row: T,
    column: Column,
    rowIndex: number
  ): CellSlotProps<T> => ({
    row,
    rowIndex,
    column,
    cellValue: valueAt(row, column.field)
  })

  return { cellText, cellAttrs, hasCellSlot, slotProps }
}
