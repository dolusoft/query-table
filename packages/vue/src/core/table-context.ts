import { inject, provide, type InjectionKey, type Slots } from 'vue'

import type { ResolvedLabels } from './labels'
import type { ColumnReorder } from '../reorder/use-column-reorder'
import type { ColumnResize } from '../resize/use-column-resize'
import type { GrowingColumns } from '../resize/use-growing-columns'
import type {
  QueryTableFilters,
  QueryTableLayout,
  QueryTableSelection,
  QueryTableSort
} from '../use-query-table'

/**
 * What the header parts call: the filter inputs, the sort gate and the
 * layout actions of the composable, the resize and reorder actions and the
 * labels. Only actions and getters travel here; data (`columns`, `query`)
 * comes down as props.
 */
export interface TableContext {
  filters: QueryTableFilters
  sort: QueryTableSort
  /** The `control` of the header and filter-menu slots (C-70). */
  layout: QueryTableLayout
  resize: ColumnResize
  /** The reorder handles: drag, keys and the drag preview (C-73). */
  reorder: ColumnReorder
  /** The select-all checkbox of the selection column (C-59, C-130). */
  selection: Pick<
    QueryTableSelection<object>,
    'allSelected' | 'someSelected' | 'canToggleAll' | 'toggleAll'
  >
  labels: () => ResolvedLabels
  /** The consumer's icon slots (C-131). */
  icons: TableIcons
  /** The widths of the growing columns (C-132). */
  grow: Pick<GrowingColumns, 'widthOf'>
}

/** The icons a slot can replace: the slot of each is `icon-<name>` (C-131). */
export type IconName =
  | 'sort'
  | 'filter'
  | 'clear-all'
  | 'reorder'
  | 'expand'
  | 'right-panel'
  | 'copy'
  | 'preview'

export interface TableIcons {
  /**
   * The consumer gave the `icon-<name>` slot. Reactive: it follows a slot
   * given or removed after mount.
   */
  has: (name: IconName) => boolean
  /** The table's slots, where `icon-<name>` is drawn from. */
  slots: Slots
}

export const tableContextKey: InjectionKey<TableContext> = Symbol('query-table')

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
