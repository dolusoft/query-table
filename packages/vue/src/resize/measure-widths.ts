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
    const measured: [string, HTMLTableCellElement, number][] = []
    for (const th of headers) {
      const field = th.dataset.field
      if (field === undefined || (wanted && !wanted.has(field))) {
        continue
      }
      const own = th.getBoundingClientRect().width
      if (own === 0) {
        // No box: the table is not displayed.
        continue
      }
      const cell = firstRow?.querySelector(
        `:scope > td[data-field="${CSS.escape(field)}"]`
      )
      measured.push([
        field,
        th,
        Math.max(own, cell?.getBoundingClientRect().width ?? 0)
      ])
    }
    const floors = options.filters
      ? filterFloors(
          measured.map(([, th]) => th),
          swap
        )
      : null
    for (const [field, th, width] of measured) {
      widths[field] = Math.ceil(Math.max(width, floors?.get(th) ?? 0))
    }
  } finally {
    swap.restore()
  }
  return widths
}

/**
 * Takes the filter rows out of the read (C-100): out of the cell's flow
 * (`position: absolute`), so nothing in them widens the column by being
 * there, and no size container, which would switch the row to its narrow
 * form. Each control of the table stops growing and shrinking: a text or
 * number input six characters wide (padding and border on top), a select
 * and a date or time input as wide as they draw themselves, a filter button
 * at its own width, back in the row's flow when a skin's narrow form laid it
 * `absolute` over the input. A control `fixed` over the page (a panel)
 * stays out.
 */
const countFilters = (
  table: HTMLTableElement,
  swap: ReturnType<typeof styleSwap>
) => {
  const rows = Array.from(table.querySelectorAll<HTMLElement>(filterRow))
  for (const row of rows) {
    swap.set(row, 'position', 'absolute')
    swap.set(row, 'container-type', 'normal')
    swap.set(row, 'contain', 'none')
    swap.set(row, 'box-sizing', 'content-box')
    for (const input of Array.from(
      row.querySelectorAll<HTMLElement>(':scope > .qt-filter-input')
    )) {
      swap.set(input, 'flex', 'none')
      swap.set(input, 'min-width', '0')
      if (input instanceof HTMLInputElement && textTypes.has(input.type)) {
        swap.set(input, 'box-sizing', 'content-box')
        swap.set(input, 'width', filterText)
      } else {
        swap.set(input, 'width', 'auto')
      }
    }
    for (const button of Array.from(
      row.querySelectorAll<HTMLElement>(':scope > .qt-filter-button')
    )) {
      swap.set(button, 'flex', 'none')
    }
  }
  // Read once the rows are no containers: a skin's narrow form is gone.
  for (const row of rows) {
    for (const button of Array.from(
      row.querySelectorAll<HTMLElement>(':scope > .qt-filter-button')
    )) {
      if (getComputedStyle(button).position === 'absolute') {
        swap.set(button, 'position', 'static')
      }
    }
  }
}

/** The inputs that keep six characters of text; the others draw their own. */
const textTypes = new Set(['text', 'number', 'search'])

const horizontal = (style: CSSStyleDeclaration) =>
  (parseFloat(style.paddingLeft) || 0) +
  (parseFloat(style.paddingRight) || 0) +
  (parseFloat(style.borderLeftWidth) || 0) +
  (parseFloat(style.borderRightWidth) || 0)

/** The table's own filter controls, the row's children, that take room. */
const controlsOf = (row: HTMLElement) =>
  Array.from(
    row.querySelectorAll<HTMLElement>(
      ':scope > :is(.qt-filter-input, .qt-filter-button)'
    )
  ).filter(control => {
    // A control laid out of the row's flow (a panel over the page) takes
    // no room in the column.
    const { position } = getComputedStyle(control)
    return position !== 'fixed' && position !== 'absolute'
  })

/** The row's content width the probes draw it at: `0` and this. */
const probe = 1000

/**
 * The width each header cell needs for its filter controls, from the
 * controls alone: the row's width is never read, so slot content in it
 * cannot count, by its own width or by a width it took from the column. The
 * controls are drawn side by side in rows `0` and `probe` pixels wide, and
 * each width (a control, the gap) is taken as a fixed part plus a share of
 * the row, which is what a percentage padding is. The row then needs `R`
 * with `R = fixed + share * R`, the cell `R` plus the row's and the cell's
 * padding and border.
 */
const filterFloors = (
  headers: HTMLTableCellElement[],
  swap: ReturnType<typeof styleSwap>
) => {
  const rows = headers.flatMap(th => {
    const row = th.querySelector<HTMLElement>(':scope > .qt-filter')
    const controls = row ? controlsOf(row) : []
    return row && controls.length > 0 ? [{ th, row, controls }] : []
  })
  const read = (width: number) => {
    for (const { row } of rows) {
      swap.set(row, 'width', `${width}px`)
    }
    return rows.map(({ row, controls }) => {
      const drawn = controls
        .map(control => control.getBoundingClientRect().width)
        .filter(each => each > 0)
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0
      return drawn.length === 0
        ? 0
        : drawn.reduce((sum, each) => sum + each, 0) + gap * (drawn.length - 1)
    })
  }
  const atZero = read(0)
  const atProbe = read(probe)
  const floors = new Map<HTMLTableCellElement, number>()
  rows.forEach(({ th, row }, index) => {
    const fixed = atZero[index]
    if (fixed === 0) {
      return
    }
    // At most 90% of the row can be a share: past that no width holds.
    const share = Math.min(0.9, Math.max(0, (atProbe[index] - fixed) / probe))
    floors.set(
      th,
      fixed / (1 - share) +
        horizontal(getComputedStyle(row)) +
        horizontal(getComputedStyle(th))
    )
  })
  return floors
}
