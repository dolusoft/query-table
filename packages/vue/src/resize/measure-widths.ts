// The width each drawn column needs for its content (C-99, ADR 0013).

/**
 * What must not count, inside the table: the filter row and the resize handle
 * of a header cell (C-50 counts the label only), the footer, and every body
 * row that is not a data row (subtable, virtual spacer, loading, empty,
 * load-more). A subtable or a spanning cell would otherwise widen the
 * columns it spans with content that is not theirs.
 */
const notCountedParts = [
  ':scope > thead > tr > th[data-field] > .qt-resize-handle',
  ':scope > tbody > tr:not([data-row-index])',
  ':scope > tfoot'
]
const filterRow = ':scope > thead > tr > th[data-field] > .qt-filter'
const notCounted = [filterRow, ...notCountedParts].join(', ')
const notCountedWithFilters = notCountedParts.join(', ')

/**
 * The room a text, number or date filter input keeps for its text when the
 * filter row counts (C-100): six characters of the input's own font.
 */
const filterText = '6ch'

interface MeasureOptions {
  /**
   * The filter row counts as a floor (C-100): laid out at the width it
   * needs, its controls side by side and six characters of text in each
   * input, so a column is never drawn narrower than its filter.
   */
  filters?: boolean
}

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
  body?: HTMLTableElement | null,
  options: MeasureOptions = {}
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
      table.querySelectorAll<HTMLElement>(
        options.filters ? notCountedWithFilters : notCounted
      )
    )) {
      swap.set(part, 'display', 'none')
    }
    if (options.filters) {
      countFilters(table, swap)
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
      const own = th.getBoundingClientRect().width
      if (own === 0) {
        // No box: the table is not displayed.
        continue
      }
      const width = Math.max(
        own,
        options.filters ? filterFloor(th) : 0,
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

/**
 * Lays the filter rows out for the floor (C-100), out of the cell's flow so
 * that nothing in them (slot content included) widens the column by being
 * there: the row is taken out of the flow (`position: absolute`) and is no
 * size container, which would count as zero wide and switch the row to its
 * narrow form, and each filter input stops growing: a text, number or date
 * input six characters wide (padding and border on top), a select as wide as
 * its longest option.
 */
const countFilters = (
  table: HTMLTableElement,
  swap: ReturnType<typeof styleSwap>
) => {
  for (const row of Array.from(
    table.querySelectorAll<HTMLElement>(filterRow)
  )) {
    swap.set(row, 'position', 'absolute')
    swap.set(row, 'container-type', 'normal')
    swap.set(row, 'contain', 'none')
    for (const input of Array.from(
      row.querySelectorAll<HTMLElement>(':scope > .qt-filter-input')
    )) {
      swap.set(input, 'flex', 'none')
      swap.set(input, 'min-width', '0')
      if (input instanceof HTMLInputElement) {
        swap.set(input, 'box-sizing', 'content-box')
        swap.set(input, 'width', filterText)
      } else {
        swap.set(input, 'width', 'auto')
      }
    }
  }
}

const horizontal = (style: CSSStyleDeclaration) =>
  (parseFloat(style.paddingLeft) || 0) +
  (parseFloat(style.paddingRight) || 0) +
  (parseFloat(style.borderLeftWidth) || 0) +
  (parseFloat(style.borderRightWidth) || 0)

/**
 * The width a header cell needs for its filter controls, read in the layout
 * `countFilters` gives: its own inputs (`.qt-filter-input`) and filter
 * buttons (`.qt-filter-button`) side by side with the row's gap between
 * them, plus the cell's padding and border. Other slot content does not
 * count, so a slot that draws more in a wide column cannot widen it.
 */
const filterFloor = (th: HTMLTableCellElement) => {
  const row = th.querySelector<HTMLElement>(':scope > .qt-filter')
  if (!row) {
    return 0
  }
  const controls = [
    ...Array.from(
      row.querySelectorAll<HTMLElement>(':scope > .qt-filter-input')
    ),
    ...Array.from(row.querySelectorAll<HTMLElement>('.qt-filter-button'))
  ]
  let sum = 0
  let count = 0
  for (const control of controls) {
    // A control laid out of the row's flow (a panel over the page) takes
    // no room in the column.
    const { position } = getComputedStyle(control)
    if (position === 'fixed' || position === 'absolute') {
      continue
    }
    const width = control.getBoundingClientRect().width
    if (width > 0) {
      sum += width
      count++
    }
  }
  if (count === 0) {
    return 0
  }
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0
  return sum + gap * (count - 1) + horizontal(getComputedStyle(th))
}
