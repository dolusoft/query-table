import type { Column, HeaderContextMenuPayload } from '../contract'

export interface HeaderContextMenuOptions {
  /** The drawn columns (hidden already dropped), in drawing order. */
  columns: () => Column[]
  /**
   * Original index of a drawn column in the consumer's `columns` (hidden
   * included), as C-28's `columnIndex`.
   */
  indexOf: (field: string) => number | undefined
  /** Someone listens to `headerContextMenu`; without one the menu is left alone. */
  listening: () => boolean
  onContextMenu: (payload: HeaderContextMenuPayload) => void
}

/**
 * One listener on the `thead` serves every header cell (C-96): a listener per
 * cell would be a new closure per cell on every render. Only a data column
 * header emits (`data-field`); utility cells keep the browser menu. A right
 * click inside the filter row (`.qt-filter`) keeps the browser menu too, so
 * paste and spell-check stay (issue #102 S1(a)).
 */
export const useHeaderContextMenu = (options: HeaderContextMenuOptions) => {
  const onContextMenu = (event: MouseEvent) => {
    if (!options.listening()) {
      return
    }
    const head = event.currentTarget as Element
    let cell = (event.target as Element | null)?.closest('th') ?? null
    while (cell && cell.parentElement?.parentElement !== head) {
      cell = cell.parentElement?.closest('th') ?? null
    }
    const field = cell?.getAttribute('data-field') ?? null
    if (field === null || !cell) {
      return
    }
    // Filter inputs keep the native menu (paste, spell check).
    const target = event.target as Element | null
    if (target?.closest('.qt-filter') && cell.contains(target.closest('.qt-filter'))) {
      return
    }
    const column = options.columns().find(c => c.field === field)
    const columnIndex = options.indexOf(field)
    if (!column || columnIndex === undefined) {
      return
    }
    event.preventDefault()
    options.onContextMenu({
      event,
      column,
      columnIndex
    })
  }

  return { onContextMenu }
}
