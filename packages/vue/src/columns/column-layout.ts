// The column layout as data (ADR 0007, C-67 to C-70): the consumer's
// `columns` owns visibility (`hide`), order (the array) and pinning
// (`pinned`). TanStack's slices are projected from it, and its updates come
// back here to become a new `columns` array: changed columns are new
// objects, the others stay the consumer's.
import type { Column } from '../contract'

/** Side a column is pinned to; `false` when it is not pinned. */
export type PinSide = 'left' | 'right' | false

export const sideOf = (column: Column): PinSide =>
  column.pinned === 'left'
    ? 'left'
    : column.pinned === 'right'
      ? 'right'
      : false

/** A copy of `column` without `key`: a default is removed, never set (C-68). */
const without = (column: Column, key: 'hide' | 'pinned'): Column => {
  const copy = { ...column }
  delete copy[key]
  return copy
}

/** The columns with the visibility of `visibility`; `null` when nothing changes. */
export const applyVisibility = (
  columns: Column[],
  visibility: Record<string, boolean>
): Column[] | null => {
  let changed = false
  const next = columns.map(column => {
    const visible = visibility[column.field] ?? true
    if (visible === !column.hide) {
      return column
    }
    changed = true
    return visible ? without(column, 'hide') : { ...column, hide: true }
  })
  return changed ? next : null
}

/** The columns in `order` (unknown fields skipped, missing ones kept last); `null` when unchanged. */
export const applyOrder = (
  columns: Column[],
  order: string[]
): Column[] | null => {
  const byField = new Map(columns.map(column => [column.field, column]))
  const placed = new Set<string>()
  const next: Column[] = []
  for (const field of order) {
    const column = byField.get(field)
    if (column && !placed.has(field)) {
      placed.add(field)
      next.push(column)
    }
  }
  next.push(...columns.filter(column => !placed.has(column.field)))
  return next.every((column, index) => column === columns[index]) ? null : next
}

/** The columns with the sides of `pinning` (start = left, end = right); `null` when unchanged. */
export const applyPinning = (
  columns: Column[],
  pinning: { start?: string[]; end?: string[] }
): Column[] | null => {
  const left = new Set(pinning.start ?? [])
  const right = new Set(pinning.end ?? [])
  let changed = false
  const next = columns.map(column => {
    const side: PinSide = left.has(column.field)
      ? 'left'
      : right.has(column.field)
        ? 'right'
        : false
    if (side === sideOf(column)) {
      return column
    }
    changed = true
    return side ? { ...column, pinned: side } : without(column, 'pinned')
  })
  return changed ? next : null
}

/** The columns with `field` at `width`; `null` when it already has it. */
export const applyWidth = (
  columns: Column[],
  field: string,
  width: string
): Column[] | null => {
  const at = columns.findIndex(column => column.field === field)
  if (at < 0 || columns[at].width === width) {
    return null
  }
  const next = [...columns]
  next[at] = { ...columns[at], width }
  return next
}

/**
 * `field` taken out and put right before or after `target` (C-69): the
 * columns between keep their place, hidden ones included.
 */
export const moveField = (
  fields: string[],
  field: string,
  target: string,
  place: 'before' | 'after'
): string[] => {
  if (field === target || !fields.includes(field)) {
    return fields
  }
  const rest = fields.filter(name => name !== field)
  const at = rest.indexOf(target)
  if (at < 0) {
    return fields
  }
  rest.splice(place === 'before' ? at : at + 1, 0, field)
  return rest
}
