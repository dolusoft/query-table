import { conditionLabel } from '@dolusoft/query-protocol'

import type { Column, TableLabels } from '../contract'

/** The labels the table reads: every entry filled, the optional ones too. */
export type ResolvedLabels = Required<TableLabels>

/** English defaults of the `labels` prop (C-44). */
const defaultLabels: ResolvedLabels = {
  clearAllFilters: 'Clear all filters',
  expandRow: 'Expand row',
  openRightPanel: 'Open right panel',
  filterInput: column => `Filter ${column}`,
  filterInputFrom: column => `Filter ${column} from`,
  filterInputTo: column => `Filter ${column} to`,
  filterOptions: column => `Filter options for ${column}`,
  resizeColumn: column => `Resize ${column}`,
  moveColumn: column => `Move ${column}`,
  filterCondition: (condition, type) => conditionLabel(type, condition),
  boolAll: 'All',
  boolTrue: 'True',
  boolFalse: 'False',
  selectRow: 'Select row',
  selectAllRows: 'Select all rows'
}

export const resolveLabels = (
  labels: Partial<TableLabels> | undefined
): ResolvedLabels => ({ ...defaultLabels, ...labels })

/** The name of a column in a label: its `title`, else its `field`. */
export const columnName = (column: Column) => column.title || column.field
