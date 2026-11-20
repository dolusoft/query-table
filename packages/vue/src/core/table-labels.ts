import { inject } from 'vue'

import { cellLabelDefaults, type CellLabels } from './cell-labels'
import { tableContextKey } from './table-context'

/**
 * The cell labels of the table a component sits in, read again on every
 * call so they follow the table's `labels` prop. An entry the table leaves
 * out, or gives as `undefined`, is the English default; outside a table
 * every entry is (C-129). The one module of the main part the cell
 * components import (ADR 0022, K320-6).
 */
export const useCellLabels = (): (() => CellLabels) => {
  const context = inject(tableContextKey, null)
  if (!context) {
    return () => cellLabelDefaults
  }
  return () => {
    const labels: Partial<CellLabels> = context.labels()
    return {
      copyValue: labels.copyValue ?? cellLabelDefaults.copyValue,
      previewValue: labels.previewValue ?? cellLabelDefaults.previewValue,
      emptyValue: labels.emptyValue ?? cellLabelDefaults.emptyValue
    }
  }
}
