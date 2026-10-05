import type { Slots } from 'vue'

import type { CellContextMenuPayload, CellSlotProps, Column } from '../contract'
import { valueAt } from '../core/column'
import type { ColumnEntry } from '../core/use-columns'

export interface CellViewOptions<T extends object> {
  /** The slots the body received: `cell-<field>` is looked up. */
  slots: Slots
  /** The rows of the body, to find the one a context menu event belongs to. */
  rows: () => T[]
  /** The drawn columns, to find the one a context menu event belongs to. */
  entries: () => ColumnEntry[]
  onContextMenu: (payload: CellContextMenuPayload<T>) => void
}

/**
 * What a body cell shows: its text, its attributes, the props for a
 * `cell-<field>` slot and the context menu event (C-27, C-28, C-30).
 */
export const useCellView = <T extends object>(options: CellViewOptions<T>) => {
  /** Text of a cell, whole: the table never cuts it. */
  const cellText = (row: T, column: Column) =>
    // A cell value may be any type; its string form is what the table shows.
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    String(valueAt(row, column.field) ?? '')

  const cellAttrs = (entry: ColumnEntry) => ({
    'data-field': entry.column.field
  })

  /**
   * One listener on the `tbody` serves every cell (C-28): a listener per cell
   * would be a new closure per cell on every render. The cell is the nearest
   * `td` whose row is a direct child of this body, so a table nested in a cell
   * or in a subtable answers for its own cells. Only a data cell counts: it
   * carries `data-field`, and its row carries `data-row-index`.
   */
  const onContextMenu = (event: MouseEvent) => {
    const body = event.currentTarget as Element
    let cell = (event.target as Element | null)?.closest('td') ?? null
    while (cell && cell.parentElement?.parentElement !== body) {
      cell = cell.parentElement?.closest('td') ?? null
    }
    const field = cell?.getAttribute('data-field') ?? null
    const index = cell?.parentElement?.getAttribute('data-row-index') ?? null
    if (field === null || index === null) {
      return
    }
    const rowIndex = Number(index)
    const row = options.rows()[rowIndex]
    const entry = options.entries().find(e => e.column.field === field)
    if (row === undefined || !entry) {
      return
    }
    event.preventDefault()
    options.onContextMenu({
      event,
      row,
      column: entry.column,
      cellValue: valueAt(row, field),
      rowIndex,
      columnIndex: entry.index
    })
  }

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

  return { cellText, cellAttrs, hasCellSlot, slotProps, onContextMenu }
}
