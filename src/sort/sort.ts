import type { Column, SortDirection, SortState } from '../contract'

/** Header click: ascending first, then flipping between the two. */
export const nextDirection = (
  sort: SortState | null,
  field: string
): SortDirection =>
  sort?.field === field && sort.direction === 'asc' ? 'desc' : 'asc'

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
