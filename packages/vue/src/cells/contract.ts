/**
 * Public contract of the cell components (`@dolusoft/query-table/cells`,
 * ADR 0022). Unstyled markup for what the product's cells draw; each
 * component's hooks are in `contract/dom.ts` (C-128) and its texts come from
 * the `labels` of the table it sits in (C-129).
 */

/** What a `CellBadge` says, not how it looks (C-128). */
export type CellBadgeTone =
  'neutral' | 'info' | 'success' | 'warning' | 'danger'

/** What a `CellAction` does, not how it looks (C-128). */
export type CellActionKind = 'default' | 'primary' | 'danger'

/** Props of `CellStack`: two lines, a primary over a secondary. */
export interface CellStackProps {
  /** The first line. The `primary` slot replaces it. */
  primary?: string | number | null
  /** The second line, drawn only when given. The `secondary` slot replaces it. */
  secondary?: string | number | null
}

/** Props of `CellCopy`: a value with a button that asks to copy it. */
export interface CellCopyProps {
  /** The value shown and emitted with `copy`. */
  value: string | number
}

/** Props of `CellPreview`: a text with a button that asks to preview it. */
export interface CellPreviewProps {
  /** The text shown and emitted with `preview`. */
  text: string | number
}

/** Props of `CellBadge`: a short status. */
export interface CellBadgeProps {
  /** The text. The default slot replaces it. */
  text?: string | number
  /** Defaults to `'neutral'`. */
  tone?: CellBadgeTone
}

/** Props of `CellValue`: a value, or the empty-value label when there is none. */
export interface CellValueProps {
  /** `null`, `undefined` and `''` draw `labels.emptyValue` (C-129). */
  value?: unknown
}

/** Props of `CellAction`: one button of a `CellActions` group. */
export interface CellActionProps {
  /** Defaults to `'default'`. */
  kind?: CellActionKind
}
