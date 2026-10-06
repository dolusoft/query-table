import type { SortDirection } from '../contract'

/** Value of the `aria-sort` attribute for a direction. */
export const ariaSort = (direction: SortDirection | null) =>
  direction === 'asc'
    ? 'ascending'
    : direction === 'desc'
      ? 'descending'
      : undefined
