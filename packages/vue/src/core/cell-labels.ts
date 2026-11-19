import type { TableLabels } from '../contract'

/** The texts the cell components write (C-129), every one filled. */
export type CellLabels = Required<
  Pick<TableLabels, 'copyValue' | 'previewValue' | 'emptyValue'>
>

/**
 * English defaults of the cell labels. This module imports nothing but
 * types, so the `/cells` entry carries these three and not the defaults of
 * the table, whose condition labels come from the protocol (ADR 0022,
 * K320-6).
 */
export const cellLabelDefaults: CellLabels = {
  copyValue: value => `Copy ${value}`,
  previewValue: text => `Preview ${text}`,
  emptyValue: '-'
}
