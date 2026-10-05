import { computed } from 'vue'

import type { Column, ColumnType } from '../contract'
import { columnTypeOf } from './column'

export interface ColumnsOptions {
  columns: () => Column[]
  hasSubtable: () => boolean
  hasRightPanel: () => boolean
}

export interface ColumnEntry {
  column: Column
  /** Position in the `columns` prop, hidden columns included. */
  index: number
  type: ColumnType
}

/**
 * The columns the table draws (hidden ones dropped) with their original
 * index and type, and how many cells a full-width row spans (C-29).
 */
export const useColumns = (options: ColumnsOptions) => {
  const entries = computed<ColumnEntry[]>(() =>
    options
      .columns()
      .map((column, index) => ({ column, index, type: columnTypeOf(column) }))
      .filter(entry => !entry.column.hide)
  )

  const visibleColumns = computed(() => entries.value.map(e => e.column))

  /** Cells before the first column: the right panel and the expand button. */
  const utilityCount = computed(
    () => Number(options.hasSubtable()) + Number(options.hasRightPanel())
  )

  const columnCount = computed(() => entries.value.length + utilityCount.value)

  return { entries, visibleColumns, utilityCount, columnCount }
}
