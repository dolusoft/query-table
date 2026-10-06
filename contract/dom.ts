/**
 * The DOM contract: the class names and `data-*` attributes the table renders.
 * They are the only hooks a skin may select. `CONTRACT.md` is generated from
 * this file, the browser tests compare the rendered DOM with it, and the test
 * skin may only select what is listed here.
 */

export interface ClassEntry {
  name: string
  /** CSS selector an element carrying the class must match. */
  on: string
  description: string
  /**
   * The rule that adds the hook on top of the 2.2.x table, when 2.2.x does
   * not render it. C-40 checks the entries without it; C-66 the ones with it.
   */
  addedBy?: string
}

export interface AttributeEntry {
  name: string
  /** CSS selector an element carrying the attribute must match. */
  on: string
  description: string
  /** As on `ClassEntry`. */
  addedBy?: string
}

export const domClasses: ClassEntry[] = [
  { name: 'qt-datatable', on: 'div', description: 'Root element.' },
  {
    name: 'qt-table-responsive',
    on: 'div',
    description: 'Scroll container around the table.'
  },
  { name: 'qt-table', on: 'table', description: 'The table.' },
  {
    name: 'qt-sort',
    on: 'th > button',
    description: 'Header button of a sortable column.'
  },
  {
    name: 'qt-title',
    on: 'th > span',
    description: 'Header text of a column that cannot be sorted.'
  },
  {
    name: 'qt-sort-icon',
    on: 'button > svg',
    description: 'Sort arrow inside `qt-sort`.'
  },
  {
    name: 'qt-filter',
    on: 'th > div',
    description:
      'Filter row of a header cell: input, filter button and condition label are its children.'
  },
  {
    name: 'qt-filter-input',
    on: 'input, select',
    description: 'The filter input of a column.'
  },
  {
    name: 'qt-filter-button',
    on: 'button',
    description:
      'Filter menu trigger, rendered by the `trigger` of the `filter-menu` slot.'
  },
  {
    name: 'qt-filter-condition',
    on: 'small',
    description: 'Label with the condition of the filter.'
  },
  {
    name: 'qt-clear-all-button',
    on: 'th > button',
    description: 'Clears every filter. Lives in the first utility header cell.'
  },
  {
    name: 'qt-expand',
    on: 'td > button',
    description: 'Expand button of a row.'
  },
  {
    name: 'qt-right-panel-button',
    on: 'td > button',
    description: 'Right panel button of a row.'
  },
  {
    name: 'qt-select-row',
    on: 'td > input',
    description:
      'Selection checkbox of a row, drawn when `selection` is given (C-64).',
    addedBy: 'C-64'
  },
  {
    name: 'qt-select-all',
    on: 'th > input',
    description:
      'Checkbox in the header of the selection column: selects or deselects every row of the page (C-64).',
    addedBy: 'C-64'
  },
  {
    name: 'qt-subtable-row',
    on: 'tbody > tr',
    description: 'Row holding the `subtable` slot of an expanded row.'
  },
  {
    name: 'qt-empty-row',
    on: 'tbody > tr',
    description: 'Row holding the `empty` slot.'
  },
  {
    name: 'qt-loading-row',
    on: 'tbody > tr',
    description:
      'Last row of the body while `loading` is on, holding the `loading` slot in one cell that spans every column. Place it over the rows in your CSS.'
  },
  {
    name: 'qt-resize-handle',
    on: 'th > div',
    description:
      'Resize handle of a resizable column: a focusable `role="separator"`, the last child of the header cell. Position it at the cell edge in your CSS.'
  },
  { name: 'qt-footer', on: 'tfoot', description: 'Totals block.' },
  {
    name: 'qt-pagination',
    on: 'div',
    description: 'Block around the `pagination` slot.'
  }
]

/** Boolean attributes are present or absent; the value is an empty string. */
export const domAttributes: AttributeEntry[] = [
  {
    name: 'data-empty',
    on: '.qt-datatable',
    description: 'Present when there are no rows and `loading` is off.'
  },
  {
    name: 'data-loading',
    on: '.qt-datatable',
    description:
      'Present while `loading` is on; the root then also carries `aria-busy="true"`.'
  },
  {
    name: 'data-field',
    on: 'th, td',
    description:
      'The column `field`, on header, body and footer cells. The table reads it on a body cell to tell which column was right-clicked.'
  },
  {
    name: 'data-sort',
    on: 'th',
    description: '`asc` or `desc` on the sorted column.'
  },
  {
    name: 'data-sortable',
    on: 'th',
    description: 'Present when the header can sort.'
  },
  {
    name: 'data-filtered',
    on: 'th, .qt-filter-button',
    description: 'Present when the column has at least one rule.'
  },
  {
    name: 'data-row-index',
    on: 'tbody > tr',
    description:
      'Index of the row in `rows`. The table reads it to tell which row was right-clicked.'
  },
  {
    name: 'data-expanded',
    on: 'tbody > tr',
    description: 'Present on an expanded row.'
  },
  {
    name: 'data-selected',
    on: 'tbody > tr',
    description: 'Present on a selected row (C-64).',
    addedBy: 'C-64'
  },
  {
    name: 'data-pinned',
    on: 'th, td',
    description:
      'Present on every cell of a pinned column (header, body, footer) and, when some column is pinned, on the utility cells. The cell also carries `--qt-pin-left`.'
  },
  {
    name: 'aria-sort',
    on: 'th',
    description: '`ascending` or `descending` on the sorted column.'
  }
]

export interface InlineStyleEntry {
  property: string
  /** CSS selector an element carrying the property must match. */
  on: string
  description: string
}

/** The only inline styles the table writes (C-31). */
export const domInlineStyles: InlineStyleEntry[] = [
  {
    property: 'width',
    on: 'th[data-field]',
    description:
      'Set from `Column.width` when the column defines it, and from the drag preview while a resize is under way.'
  },
  {
    property: '--qt-pin-left',
    on: '[data-pinned]',
    description:
      'Left offset of a pinned cell in pixels: the measured widths of the pinned header cells before it. Use it as `left: var(--qt-pin-left)` next to your own `position: sticky`.'
  }
]
