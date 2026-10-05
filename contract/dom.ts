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
}

export interface AttributeEntry {
  name: string
  /** CSS selector an element carrying the attribute must match. */
  on: string
  description: string
}

export const domClasses: ClassEntry[] = [
  { name: 'bh-datatable', on: 'div', description: 'Root element.' },
  {
    name: 'bh-table-responsive',
    on: 'div',
    description: 'Scroll container around the table.'
  },
  { name: 'bh-table', on: 'table', description: 'The table.' },
  {
    name: 'bh-sort',
    on: 'th > button',
    description: 'Header button of a sortable column.'
  },
  {
    name: 'bh-title',
    on: 'th > span',
    description: 'Header text of a column that cannot be sorted.'
  },
  {
    name: 'bh-sort-icon',
    on: 'button > svg',
    description: 'Sort arrow inside `bh-sort`.'
  },
  {
    name: 'bh-filter',
    on: 'th > div',
    description:
      'Filter row of a header cell: input, filter button and condition label are its children.'
  },
  {
    name: 'bh-filter-input',
    on: 'input, select',
    description: 'The filter input of a column.'
  },
  {
    name: 'bh-filter-button',
    on: 'button',
    description:
      'Filter menu trigger, rendered by the `trigger` of the `filter-menu` slot.'
  },
  {
    name: 'bh-filter-condition',
    on: 'small',
    description: 'Label with the condition of the filter.'
  },
  {
    name: 'bh-clear-all-button',
    on: 'th > button',
    description: 'Clears every filter. Lives in the first utility header cell.'
  },
  {
    name: 'bh-expand',
    on: 'td > button',
    description: 'Expand button of a row.'
  },
  {
    name: 'bh-right-panel-button',
    on: 'td > button',
    description: 'Right panel button of a row.'
  },
  {
    name: 'bh-subtable-row',
    on: 'tbody > tr',
    description: 'Row holding the `subtable` slot of an expanded row.'
  },
  {
    name: 'bh-empty-row',
    on: 'tbody > tr',
    description: 'Row holding the `empty` slot.'
  },
  { name: 'bh-footer', on: 'tfoot', description: 'Totals block.' },
  {
    name: 'bh-pagination',
    on: 'div',
    description: 'Block around the `pagination` slot.'
  }
]

/** Boolean attributes are present or absent; the value is an empty string. */
export const domAttributes: AttributeEntry[] = [
  {
    name: 'data-empty',
    on: '.bh-datatable',
    description: 'Present when there are no rows.'
  },
  {
    name: 'data-field',
    on: 'th, td',
    description: 'The column `field`, on header, body and footer cells.'
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
    on: 'th, .bh-filter-button',
    description: 'Present when the column has at least one rule.'
  },
  {
    name: 'data-row-index',
    on: 'tbody > tr',
    description: 'Index of the row in `rows`.'
  },
  {
    name: 'data-expanded',
    on: 'tbody > tr',
    description: 'Present on an expanded row.'
  },
  {
    name: 'aria-sort',
    on: 'th',
    description: '`ascending` or `descending` on the sorted column.'
  }
]

/** The only inline style the table writes. */
export const domInlineStyle = {
  on: 'th',
  property: 'width',
  description: 'Set from `Column.width`, only when the column defines it.'
}
