import { inject, provide, type InjectionKey } from 'vue'

import type { TableLabels } from '../contract'
import type { FilterDrafts } from '../filter/use-filter-drafts'
import type { SortActions } from '../sort/use-sort'

/**
 * What the header parts call: the filter drafts, the sort gate and the
 * labels. Only actions and the label getter travel here; data (`columns`,
 * `query`) comes down as props.
 */
export interface TableContext {
  drafts: FilterDrafts
  sort: SortActions
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
