import { computed } from 'vue'

import type { Column } from '../contract'

export interface ColumnsOptions {
  columns: () => Column[]
  hasSubtable: () => boolean
  hasRightPanel: () => boolean
}

export interface ColumnEntry {
  column: Column
  /** Position in the `columns` prop, hidden columns included. */
  index: number
}

/** Header cells before the first column, in drawing order. */
export type Utility = 'right-panel' | 'subtable'

/**
 * The columns the table draws (hidden ones dropped, pinned ones first) with
 * their original index, and how many cells a full-width row spans (C-29,
 * C-46).
 */
export const useColumns = (options: ColumnsOptions) => {
  const entries = computed<ColumnEntry[]>(() => {
    const visible = options
      .columns()
      .map((column, index) => ({ column, index }))
      .filter(entry => !entry.column.hide)
    // A stable partition: pinned columns first, each group in its own order.
    return [
      ...visible.filter(entry => entry.column.pinned === 'left'),
      ...visible.filter(entry => entry.column.pinned !== 'left')
    ]
  })
  const visibleColumns = computed(() => entries.value.map(e => e.column))
  /** Right panel first, then subtable (C-22: the first hosts clear-all). */
  const utilities = computed(() =>
    [
      options.hasRightPanel() ? 'right-panel' : null,
      options.hasSubtable() ? 'subtable' : null
    ].filter((name): name is Utility => name !== null)
  )
  const utilityCount = computed(() => utilities.value.length)
  const columnCount = computed(() => entries.value.length + utilityCount.value)
  /** Some visible column is pinned: the utility cells are pinned with it. */
  const hasPinned = computed(() =>
    entries.value.some(entry => entry.column.pinned === 'left')
  )
  return {
    entries,
    visibleColumns,
    utilities,
    utilityCount,
    columnCount,
    hasPinned
  }
}
