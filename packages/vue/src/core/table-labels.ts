import { inject, renderSlot, type FunctionalComponent } from 'vue'

import { cellLabelDefaults, type CellLabels } from './cell-labels'
import { tableContextKey, type IconName } from './table-context'

// The one module of the main part the cell components import (ADR 0022,
// K320-6): what they read from the table they sit in, its labels and, as
// they read those (D-02 of #100), its icon slots.

/**
 * The cell labels of the table a component sits in, read again on every
 * call so they follow the table's `labels` prop. An entry the table leaves
 * out, or gives as `undefined`, is the English default; outside a table
 * every entry is (C-129).
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

/**
 * Draws the `icon-<name>` slot of the table it sits in (C-131), else its own
 * default slot, the built-in icon. It draws no element of its own, so
 * without the slot the markup is the built-in icon alone; outside a table
 * it always is. The header parts draw their icons with it too.
 */
export const IconSlot: FunctionalComponent<{
  name: IconName
  state?: Record<string, unknown>
}> = (props, { slots }) => {
  const icons = inject(tableContextKey, null)?.icons
  return icons?.has(props.name)
    ? renderSlot(icons.slots, `icon-${props.name}`, props.state)
    : slots.default?.()
}
