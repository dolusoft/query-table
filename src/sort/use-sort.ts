import type {
  Column,
  QueryChangeReason,
  SortDirection,
  TableQuery
} from '../contract'
import { isSortableColumn, nextDirection, sortDirectionOf } from './sort'
import { cloneQuery } from '../core/query'

export interface SortOptions {
  /** The `sortable` prop: whether the table sorts at all. */
  sortable: () => boolean
  /** The query the table currently shows. */
  query: () => TableQuery
  /** The query a new update must build on. */
  base: () => TableQuery
  update: (next: TableQuery, reason: QueryChangeReason) => void
  /** Applies pending filter drafts before the sort goes out. */
  flushFilters: () => void
}

/**
 * Header and menu sorting go through one gate, `sortBy`. It does nothing for a
 * column that is not sortable (C-07); `isSortable` tells the markup which
 * columns get a sort control.
 */
export const useSort = (options: SortOptions) => {
  const isSortable = (column: Column) =>
    isSortableColumn(options.sortable(), column)

  const sortOf = (column: Column): SortDirection | null =>
    sortDirectionOf(options.query().sort, column)

  const sortBy = (column: Column, direction?: SortDirection) => {
    if (!isSortable(column)) {
      return
    }
    options.flushFilters()
    const current = options.base()
    const next = direction ?? nextDirection(current.sort, column.field)
    options.update(
      {
        ...cloneQuery(current),
        sort: next === null ? null : { field: column.field, direction: next }
      },
      'sort'
    )
  }

  return { isSortable, sortOf, sortBy }
}

export type SortActions = ReturnType<typeof useSort>
