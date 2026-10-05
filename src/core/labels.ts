import type { Column, TableLabels } from '../contract'

/** English defaults of the `labels` prop (C-44). */
const defaultLabels: TableLabels = {
  clearAllFilters: 'Clear all filters',
  expandRow: 'Expand row',
  openRightPanel: 'Open right panel',
  filterInput: column => `Filter ${column}`,
  filterOptions: column => `Filter options for ${column}`,
  boolAll: 'All',
  boolTrue: 'True',
  boolFalse: 'False'
}

export const resolveLabels = (
  labels: Partial<TableLabels> | undefined
): TableLabels => ({ ...defaultLabels, ...labels })

/** The name of a column in a label: its `title`, else its `field`. */
export const columnName = (column: Column) => column.title || column.field
