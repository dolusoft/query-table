// Which playground page shows which part of the public contract. Every prop,
// event, slot, exposed member and public type of contract/api.json and every behavior rule
// of contract/rules.md must appear on at least one page;
// playground/manifest.spec.ts fails otherwise. Each page lists the members
// in its API panel and the rules under "Covered rules".

export interface PageApi {
  props?: string[]
  emits?: string[]
  slots?: string[]
  exposed?: string[]
  /** Exported types of src/contract.ts. */
  types?: string[]
}

export interface PlaygroundPage {
  /** Route path segment, also the page id. */
  id: string
  title: string
  summary: string
  /** File name in playground/examples, without `.vue`. */
  example: string
  api: PageApi
  rules: string[]
}

export const pages: PlaygroundPage[] = [
  {
    id: 'overview',
    title: 'Overview',
    summary:
      'A server-backed list with sorting, filters and paging. The page owns the query; a fake server answers each change.',
    example: 'Overview',
    api: {
      props: [
        'query',
        'columns',
        'rows',
        'totalRows',
        'sortable',
        'filterable',
        'pagination',
        'rowKey'
      ],
      emits: ['update:query'],
      slots: ['toolbar', 'filter-menu', 'empty', 'pagination'],
      types: ['TableProps', 'TableEmits', 'TableSlots', 'Column', 'TableQuery']
    },
    rules: [
      'C-01',
      'C-02',
      'C-03',
      'C-30',
      'C-31',
      'C-32',
      'C-39',
      'C-40',
      'C-41'
    ]
  },
  {
    id: 'filtering',
    title: 'Filtering',
    summary:
      'One column per filter type (string, integer, number, date, bool), operator shortcuts, the condition menu, outside changes and a hidden column.',
    example: 'Filtering',
    api: {
      props: ['filterable', 'filterDebounce', 'columns', 'hasRightPanel'],
      slots: ['filter-menu', 'filter-datetime'],
      types: [
        'ColumnType',
        'FilterCondition',
        'FilterValue',
        'FilterRule',
        'FilterMenuSlotProps',
        'FilterConditionOption',
        'FilterDatetimeSlotProps'
      ]
    },
    rules: [
      'C-09',
      'C-10',
      'C-11',
      'C-12',
      'C-15',
      'C-16',
      'C-17',
      'C-18',
      'C-20',
      'C-21',
      'C-22',
      'C-29',
      'C-34',
      'C-35',
      'C-42',
      'C-43'
    ]
  },
  {
    id: 'sorting',
    title: 'Sorting',
    summary:
      'Header clicks and the filter menu set the sort; a column can opt out with `sortable: false`.',
    example: 'Sorting',
    api: {
      props: ['sortable', 'columns'],
      emits: ['update:query'],
      slots: ['filter-menu'],
      types: ['SortState', 'SortDirection']
    },
    rules: ['C-04', 'C-07', 'C-08']
  },
  {
    id: 'pagination',
    title: 'Pagination',
    summary:
      'The paging controls live in the `pagination` slot. The total can be known or unknown.',
    example: 'Pagination',
    api: {
      props: ['totalRows', 'pagination'],
      slots: ['pagination'],
      types: ['PaginationOptions', 'PaginationSlotProps']
    },
    rules: ['C-05', 'C-06', 'C-23', 'C-25']
  },
  {
    id: 'row-expansion',
    title: 'Row expansion & nested table',
    summary:
      'Expandable rows with a nested table in the `subtable` slot, kept by `rowKey`; `collapseAll()` closes them.',
    example: 'RowExpansion',
    api: {
      props: ['hasSubtable', 'rowKey'],
      slots: ['subtable'],
      exposed: ['collapseAll'],
      types: ['SubtableSlotProps', 'QueryTableExpose']
    },
    rules: ['C-26']
  },
  {
    id: 'footer-rows',
    title: 'Footer rows',
    summary:
      'Totals rows in a `tfoot`; the server computes them over every matching row.',
    example: 'FooterRows',
    api: { props: ['footerRows'], types: ['FooterRow'] },
    rules: ['C-37', 'C-47']
  },
  {
    id: 'column-pinning',
    title: 'Column pinning',
    summary:
      "Columns with `pinned: 'left'` are drawn first and carry `data-pinned` and the measured `--qt-pin-left` offset; the skin makes them sticky while the table scrolls sideways.",
    example: 'ColumnPinning',
    api: { props: ['columns', 'hasSubtable'], types: ['Column'] },
    rules: ['C-31', 'C-32', 'C-46', 'C-47']
  },
  {
    id: 'column-resizing',
    title: 'Column resizing',
    summary:
      'A resize handle per header: drag, arrow keys or autofit emit `columnResize`; the page stores the widths and writes them back to `Column.width`.',
    example: 'ColumnResizing',
    api: {
      props: ['resizable', 'columns', 'labels'],
      emits: ['columnResize'],
      types: ['ColumnResizePayload']
    },
    rules: ['C-48', 'C-49', 'C-50']
  },
  {
    id: 'header-slot',
    title: 'Header slot',
    summary:
      '`header-<field>` replaces the label of one header; the cell, its sort state, the filter row and the resize handle stay.',
    example: 'HeaderSlot',
    api: { slots: ['header-<field>'], types: ['HeaderSlotProps'] },
    rules: ['C-51']
  },
  {
    id: 'custom-cells',
    title: 'Slots & custom cells',
    summary:
      'Cell slots with a checkbox, a link and a badge; the context menu and right-panel events.',
    example: 'CustomCells',
    api: {
      props: ['hasRightPanel'],
      emits: ['cellContextMenu', 'rowRightPanelClick'],
      slots: ['cell-<field>'],
      types: ['CellSlotProps', 'CellContextMenuPayload']
    },
    rules: ['C-27', 'C-28', 'C-36']
  },
  {
    id: 'empty-state',
    title: 'Empty state',
    summary:
      'The `empty` slot shows when there are no rows, whatever the total says. Loading is the consumer’s to draw.',
    example: 'EmptyState',
    api: { props: ['rows', 'totalRows'], slots: ['empty'] },
    rules: ['C-24', 'C-38']
  },
  {
    id: 'query-model',
    title: 'Query v-model',
    summary:
      'Every `update:query` with its reason, live. Ignore updates, flush pending filters, or reset the query from outside.',
    example: 'QueryModel',
    api: {
      props: ['query', 'filterDebounce'],
      emits: ['update:query'],
      exposed: ['flushPendingFilters'],
      types: ['TableQuery', 'QueryChangeReason', 'QueryTableExpose']
    },
    rules: ['C-01', 'C-02', 'C-04', 'C-13', 'C-14', 'C-19', 'C-33']
  },
  {
    id: 'labels',
    title: 'Labels & accessibility',
    summary:
      'Every text the table writes comes from `labels`. Header cells are column headers, and a sort button without a title is named by its field. The toolbar clears the filters in a table without utility columns.',
    example: 'Labels',
    api: {
      props: ['labels', 'filterable', 'sortable'],
      slots: ['toolbar'],
      types: ['TableLabels', 'ToolbarSlotProps']
    },
    rules: ['C-22', 'C-44', 'C-45']
  }
]
