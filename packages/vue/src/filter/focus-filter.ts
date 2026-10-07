// Elements of a filter row that can take focus, in the order they are drawn:
// the table's own input or select, or what the `filter-datetime` slot draws.
// The `filter-menu` trigger is a menu button, not the filter itself.
const focusable =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focuses the filter of `field` in this table's own header (C-54). Header
 * cells are walked directly, so a table nested in a slot is never searched.
 * Returns whether the element took focus.
 */
export const focusFilterOf = (
  table: HTMLTableElement | null,
  field: string
): boolean => {
  const head = [...(table?.children ?? [])].find(
    child => child.tagName === 'THEAD'
  )
  for (const row of head?.children ?? []) {
    for (const cell of row.children) {
      if (cell.getAttribute('data-field') !== field) {
        continue
      }
      const filter = [...cell.children].find(child =>
        child.classList.contains('qt-filter')
      )
      const target = [
        ...(filter?.querySelectorAll<HTMLElement>(focusable) ?? [])
      ].find(element => !element.classList.contains('qt-filter-button'))
      if (!target) {
        return false
      }
      target.focus()
      return target.ownerDocument.activeElement === target
    }
  }
  return false
}

/**
 * Focuses the first filter of this table's header that takes the focus, in
 * column order (C-22). Returns whether one did.
 */
export const focusFirstFilter = (table: HTMLTableElement | null): boolean => {
  const head = [...(table?.children ?? [])].find(
    child => child.tagName === 'THEAD'
  )
  for (const row of head?.children ?? []) {
    for (const cell of row.children) {
      const field = cell.getAttribute('data-field')
      if (field !== null && focusFilterOf(table, field)) {
        return true
      }
    }
  }
  return false
}
