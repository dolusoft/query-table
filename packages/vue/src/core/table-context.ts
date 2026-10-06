import { inject, provide, type InjectionKey } from 'vue'

import type { TableLabels } from '../contract'
import type { ColumnResize } from '../resize/use-column-resize'
import type {
  QueryTableFilters,
  QueryTableLayout,
  QueryTableSelection,
  QueryTableSort
} from '../use-query-table'

/**
 * What the header parts call: the filter inputs, the sort gate and the
 * layout actions of the composable, the resize actions and the labels. Only
 * actions and getters travel here; data (`columns`, `query`) comes down as
 * props.
 */
export interface TableContext {
  filters: QueryTableFilters
  sort: QueryTableSort
  /** The `control` of the header and filter-menu slots (C-70). */
  layout: QueryTableLayout
  resize: ColumnResize
  /** The select-all checkbox of the selection column (C-59). */
  selection: Pick<
    QueryTableSelection<object>,
    'allSelected' | 'someSelected' | 'toggleAll'
  >
  labels: () => TableLabels
}

const tableContextKey: InjectionKey<TableContext> = Symbol('query-table')

export const provideTableContext = (context: TableContext) => {
  provide(tableContextKey, context)
}

export const useTableContext = (): TableContext => {
  const context = inject(tableContextKey)
  if (!context) {
    throw new Error('Header parts must be rendered inside a QueryTable')
  }
  return context
}
