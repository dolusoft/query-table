// The width each drawn column needs for its content (C-99, ADR 0013).

/**
 * What must not count, inside the table: the filter row and the resize handle
 * of a header cell (C-50 counts the label only), the footer, and every body
 * row that is not a data row (subtable, virtual spacer, loading, empty,
 * load-more). A subtable or a spanning cell would otherwise widen the
 * columns it spans with content that is not theirs.
 */
const notCounted = [
  ':scope > thead > tr > th[data-field] > .qt-filter',
  ':scope > thead > tr > th[data-field] > .qt-resize-handle',
  ':scope > tbody > tr:not([data-row-index])',
  ':scope > tfoot'
].join(', ')

/**
 * Sets inline declarations for one read and puts every `style` attribute
 * back exactly as it was, absent included, so the markup after the call is
 * the markup before it (C-31). `!important` so a consumer's `!important`
 * rule cannot keep the fixed layout during the read.
 */
export const styleSwap = () => {
  const saved = new Map<HTMLElement, string | null>()
  return {
    set(element: HTMLElement, property: string, value: string) {
      if (!saved.has(element)) {
        saved.set(element, element.getAttribute('style'))
      }
      element.style.setProperty(property, value, 'important')
    },
    restore() {
      for (const [element, style] of saved) {
        if (style === null) {
          // Chrome writes a CSSOM change to the attribute lazily: removed
          // before that write, the attribute comes back as `style=""`. The
          // read flushes it first.
          element.getAttribute('style')
          element.removeAttribute('style')
        } else {
          element.setAttribute('style', style)
        }
      }
      saved.clear()
    }
  }
}

/**
 * The max-content width of each drawn column, by `field`: header label and
 * the cells of the drawn data rows, padding and border included, in whole
 * pixels rounded up. The browser lays the table out once with its automatic
 * layout and no widths, the parts that do not count taken out, and every
 * style is put back before the function returns: nothing is painted in
 * between, and slot content that draws a block or a flex box counts with the
 * width its content needs, not the width its cell gives it. Only `fields`
 * when given; a column with no box (the table not displayed) is left out.
 * With `scrollBody` the data rows are in a table of their own, `body`
 * (C-101): it is laid out the same way, its `col` widths left out, and a
 * column takes the wider of its header cell and its body cells.
 */
export const measureColumnWidths = (
  table: HTMLTableElement | null | undefined,
  fields?: readonly string[],
  body?: HTMLTableElement | null
): Record<string, number> => {
  const widths: Record<string, number> = {}
  if (!table?.tHead) {
    return widths
  }
  const wanted = fields ? new Set(fields) : null
  const headers = Array.from(
    table.querySelectorAll<HTMLTableCellElement>(
      ':scope > thead > tr > th[data-field]'
    )
  )
  const swap = styleSwap()
  try {
    swap.set(table, 'table-layout', 'auto')
    swap.set(table, 'width', 'max-content')
    swap.set(table, 'min-width', '0')
    for (const th of headers) {
      swap.set(th, 'width', 'auto')
    }
    for (const part of Array.from(
      table.querySelectorAll<HTMLElement>(notCounted)
    )) {
      swap.set(part, 'display', 'none')
    }
    const split = body && body !== table ? body : null
    if (split) {
      swap.set(split, 'table-layout', 'auto')
      swap.set(split, 'width', 'max-content')
      swap.set(split, 'min-width', '0')
      for (const col of Array.from(
        split.querySelectorAll<HTMLElement>(':scope > colgroup > col')
      )) {
        swap.set(col, 'width', 'auto')
      }
      for (const part of Array.from(
        split.querySelectorAll<HTMLElement>(
          ':scope > tbody > tr:not([data-row-index])'
        )
      )) {
        swap.set(part, 'display', 'none')
      }
    }
    // One data row is enough: the cells of a column share its width.
    const firstRow = split?.querySelector(':scope > tbody > tr[data-row-index]')
    for (const th of headers) {
      const field = th.dataset.field
      if (field === undefined || (wanted && !wanted.has(field))) {
        continue
      }
      const cell = firstRow?.querySelector(
        `:scope > td[data-field="${CSS.escape(field)}"]`
      )
      const width = Math.max(
        th.getBoundingClientRect().width,
        cell?.getBoundingClientRect().width ?? 0
      )
      if (width > 0) {
        widths[field] = Math.ceil(width)
      }
    }
  } finally {
    swap.restore()
  }
  return widths
}
