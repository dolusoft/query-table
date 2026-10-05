import type { Slots } from 'vue'

import type { CellContextMenuPayload, CellSlotProps, Column } from '../contract'
import { valueAt } from '../core/column'
import type { ColumnEntry } from '../core/use-columns'

export interface CellViewOptions<T extends object> {
  /** The slots the body received: `cell-<field>` is looked up. */
  slots: Slots
  onContextMenu: (payload: CellContextMenuPayload<T>) => void
}

/**
 * What a body cell shows: its text, its attributes, the props for a `cell-<field>` slot and the context menu event
 * (C-27, C-28, C-30, C-37).
 */
export const useCellView = <T extends object>(options: CellViewOptions<T>) => {
  /** Text of a cell, whole: the table never cuts it. */
  const cellText = (row: T, column: Column) =>
    // A cell value may be any type; its string form is what the table shows.
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    String(valueAt(row, column.field) ?? '')

  const cellAttrs = (row: T, entry: ColumnEntry, rowIndex: number) => ({
    'data-field': entry.column.field,
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
