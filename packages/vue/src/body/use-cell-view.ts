import type { CellContextMenuPayload } from '../contract'
import { valueAt } from '../core/column'
import type { ColumnEntry } from '../use-query-table'

export interface CellViewOptions<T extends object> {
  /** The rows of the body, to find the one a context menu event belongs to. */
  rows: () => T[]
  /** The drawn columns, to find the one a context menu event belongs to. */
  entries: () => ColumnEntry[]
  /** Someone listens to `cellContextMenu`; without one the menu is left alone. */
  listening: () => boolean
  onContextMenu: (payload: CellContextMenuPayload<T>) => void
}

/**
 * The context menu event of the body cells (C-28). What a cell shows is
 * drawn by its row (`parts/table-row.ts`).
 */
export const useCellView = <T extends object>(options: CellViewOptions<T>) => {
  /**
   * One listener on the `tbody` serves every cell (C-28): a listener per cell
   * would be a new closure per cell on every render. The cell is the nearest
   * `td` whose row is a direct child of this body. A table nested in a
   * subtable row: the walk ends on the subtable `td`, which has no
   * `data-field`, so this body stays quiet and the inner table answers for its
   * own cells. A table nested in a `cell-<field>` slot: the inner table emits
   * for its cell, then this body emits for the outer cell that holds it (the
   * same as a listener on every cell did). Only a data cell counts: it carries
   * `data-field`, and its row carries `data-row-index`.
   */
  const onContextMenu = (event: MouseEvent) => {
    // Without a listener the event has no use: keep the browser menu (C-28).
    if (!options.listening()) {
      return
    }
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

  return { onContextMenu }
}
