import type { SortDirection, SortState } from '../contract'

/** Header click: ascending first, then flipping between the two. */
export const nextDirection = (
  sort: SortState | null,
  field: string
): SortDirection =>
  sort?.field === field && sort.direction === 'asc' ? 'desc' : 'asc'
