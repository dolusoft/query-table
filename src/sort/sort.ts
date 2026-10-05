import type { Column, SortDirection, SortState } from '../contract'

/**
 * Header click: ascending, then descending, then none (`null`: the sort is
 * removed). A click on a column that is not the sorted one starts at ascending.
 */
export const nextDirection = (
  sort: SortState | null,
  field: string
): SortDirection | null => {
  if (sort?.field !== field) {
    return 'asc'
  }
  return sort.direction === 'asc' ? 'desc' : null
}

/** A column sorts when the table allows it and the column does not opt out. */
export const isSortableColumn = (
  tableSortable: boolean,
  column: Column
): boolean => tableSortable && column.sortable !== false

/** The direction `sort` has on `column`, or `null` when it sorts another one. */
export const sortDirectionOf = (
  sort: SortState | null,
  column: Column
): SortDirection | null =>
  sort?.field === column.field ? sort.direction : null

/** Value of the `aria-sort` attribute for a direction. */
export const ariaSort = (direction: SortDirection | null) =>
  direction === 'asc'
    ? 'ascending'
    : direction === 'desc'
      ? 'descending'
      : undefined
