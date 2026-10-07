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
   * not render it. C-40 checks the entries without it; C-66 the ones the
   * selection adds (`C-64`), C-72 the ones of the 3.1 features and C-82 the
   * column type.
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
  {
    name: 'qt-reorder-handle',
    on: 'th > button',
    description:
      'Reorder handle of a column, the first child of the header cell (C-73). Give it `touch-action: none` in your CSS.',
    addedBy: 'C-73'
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
    name: 'data-pinned-row',
    on: 'tbody > tr',
    description:
      '`top` or `bottom` on a pinned row and on its subtable row (C-74).',
    addedBy: 'C-74'
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
      'Empty on every cell of a column pinned to the left (header, body, footer) and, while some column is pinned to the left, on the utility cells; the cell also carries `--qt-pin-left`. `right` on a column pinned to the right (C-71).'
  },
  {
    name: 'data-pinned',
    on: 'th[data-pinned="right"], td[data-pinned="right"]',
    description:
      'Value `right`: a cell of a column pinned to the right (header, body, footer); it also carries `--qt-pin-right` (C-71).',
    addedBy: 'C-71'
  },
  {
    name: 'data-dragging',
    on: 'th',
    description: 'On the header cell of the column being dragged (C-73).',
    addedBy: 'C-73'
  },
  {
    name: 'data-drop',
    on: 'th',
    description:
      '`before` or `after`: the header cell the dragged column would be placed next to (C-73).',
    addedBy: 'C-73'
  },
  {
    name: 'data-type',
    on: 'th[data-field], td[data-field]',
    description:
      'The column type as C-39 reads it (`string`, `number`, `integer`, `date`, `datetime` or `bool`; `string` when missing or unknown), on the header, body and footer cells of a column. The table draws no alignment; a skin aligns by it (C-82).',
    addedBy: 'C-82'
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
  /** As on `ClassEntry`. */
  addedBy?: string
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
    on: '[data-pinned=""]',
    description:
      'Left offset of a pinned cell in pixels: the measured widths of the pinned header cells before it. Use it as `left: var(--qt-pin-left)` next to your own `position: sticky`.'
  },
  {
    property: '--qt-pin-right',
    on: '[data-pinned="right"]',
    description:
      'Right offset of a right-pinned cell in pixels: the measured widths of the right-pinned header cells after it. Use it as `right: var(--qt-pin-right)` next to your own `position: sticky`.',
    addedBy: 'C-71'
  }
]
