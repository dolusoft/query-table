import type {
  Dataset,
  LocalQueryError,
  SemanticsProfile
} from '@dolusoft/query-protocol/local'

import type {
  TableEmits,
  TableProps,
  TableQuery,
  TableSlots
} from '../contract'

/**
 * Public contract of `DataTable` (`@dolusoft/query-table/data-table`,
 * ADR 0021). Its surface is the one of `QueryTable` with the difference
 * listed here (C-124); everything it shares with `QueryTable` is described in
 * `../contract.ts`.
 */

/**
 * The props of `QueryTable` that `DataTable` does not take (C-124): it knows
 * the total, pages by `page` and `pageSize` only, has no next page to ask a
 * server for and gives the flash its own hint.
 */
export type DataTableOmittedProp =
  'totalRows' | 'cursors' | 'infinite' | 'rowsUpdate'

/** Props of `DataTable`: those of `QueryTable`, with its rows held in the page (C-124). */
export interface DataTableProps<
  T extends object = Record<string, unknown>
> extends Omit<
  TableProps<T, TableQuery>,
  'query' | 'rows' | 'rowKey' | DataTableOmittedProp
> {
  /**
   * The query, used with `v-model:query`. Optional: without it the table
   * holds the query for as long as it lives (C-125).
   */
  query?: TableQuery
  /**
   * Every row of the source, not one page. Changes inside a deeply reactive
   * array are seen; replace a shallowRef's array to have them seen.
   */
  rows: readonly T[]
  /**
   * The field that identifies a row: a top-level field, a column of type
   * `string` or `integer` (it may be `hide: true`). It breaks sort ties and
   * keys selection and expansion across pages.
   */
  rowKey: keyof T & string
  /** The semantics profile of the evaluation. Defaults to `'tr-2'`, and that default never moves. */
  profile?: SemanticsProfile
  /** The fields of the global search: `string` columns (C-126). Defaults to none. */
  search?: string[]
  /**
   * `false` draws every matching row and passes no `pagination` slot, so no
   * pagination block is drawn. Defaults to `true`.
   */
  paginate?: boolean
  /**
   * Replaces the dataset built from the columns, whole (C-126): for a field
   * that needs `get` or `offset`, or a queryable field with no column.
   */
  dataset?: Dataset<T>
}

/** Events of `DataTable`: those of `QueryTable`. */
export type DataTableEmits<T> = TableEmits<T, TableQuery>

/** Props of the `error` slot. */
export interface ErrorSlotProps {
  /** What the evaluator reported: an invalid query is not an empty result. */
  error: LocalQueryError
}

/** Slots of `DataTable`: those of `QueryTable`, and `error`. */
export interface DataTableSlots<T> extends TableSlots<T> {
  /**
   * Drawn in the empty row while the evaluator reports an error. Without it
   * the `empty` slot is drawn.
   */
  error?(props: ErrorSlotProps): unknown
}
