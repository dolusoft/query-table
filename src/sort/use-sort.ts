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
 * Header and menu sorting go through one gate, `sortBy`; `isSortable` tells
 * the callers which columns may use it (C-07).
 */
export const useSort = (options: SortOptions) => {
  const isSortable = (column: Column) =>
    isSortableColumn(options.sortable(), column)

  const sortOf = (column: Column): SortDirection | null =>
    sortDirectionOf(options.query().sort, column)

  const sortBy = (field: string, direction?: SortDirection) => {
    options.flushFilters()
    const current = options.base()
    options.update(
      {
        ...cloneQuery(current),
        sort: {
          field,
          direction: direction ?? nextDirection(current.sort, field)
        }
      },
      'sort'
    )
  }

  return { isSortable, sortOf, sortBy }
}

export type SortActions = ReturnType<typeof useSort>
