// The variation matrix of #204: the forms a table of rows already in the page
// takes in a product, one axis per row. The DataTable variations page draws
// one variation of every axis at a time, with `DataTable` or with the same
// props on `QueryTable` and `useLocalQuery`;
// tests/contract/browser/data-table-variations.browser.spec.ts checks each
// variation and that both draw the same table.
//
// The data source is not an axis here: rows from a server are `QueryTable`
// (the Overview page), and infinite scroll is `QueryTable` with `infinite`,
// which `DataTable` does not take (C-124); its local form is the virtual body.

export interface Variation {
  label: string
  /** What the variation sets, in the page's caption. */
  note: string
}

const axis = <const V extends Record<string, Variation>>(
  title: string,
  variations: V
) => ({ title, variations })

export const axes = {
  paging: axis('Paging', {
    pages: {
      label: 'Pages with a page size',
      note: '`pagination.pageSizeOptions` and a `pagination` slot.'
    },
    all: {
      label: 'Every row, no pages',
      note: '`paginate: false`: every match, no pagination block.'
    },
    virtual: {
      label: 'Virtual body',
      note: '`paginate: false` and `virtual` in a scroll box: only the rows in view are drawn.'
    }
  }),
  expand: axis('Expanding rows', {
    none: { label: 'None', note: 'No `hasSubtable`.' },
    multiple: {
      label: 'Several open',
      note: '`hasSubtable` and a `subtable` slot.'
    },
    single: {
      label: 'One open (accordion)',
      note: '`expandMode: "single"`: opening a row closes the other.'
    },
    some: {
      label: 'Some rows',
      note: '`rowExpandable`: rows without a detail have no button (C-98).'
    },
    open: {
      label: 'Open at the start',
      note: '`isExpanded: true` on the first row seeds its state.'
    },
    nested: {
      label: 'A table inside',
      note: 'The `subtable` slot draws a `QueryTable` of the row’s details.'
    },
    lazy: {
      label: 'Loaded when opened',
      note: 'The `subtable` slot fetches its content when it is mounted.'
    }
  }),
  selection: axis('Selection', {
    none: { label: 'None', note: 'No `selection`.' },
    many: {
      label: 'Several rows',
      note: '`v-model:selection`; the count and the bulk action are the page’s.'
    }
  }),
  query: axis('Sort, filter, search', {
    filters: {
      label: 'Sort and filter row',
      note: '`sortable` and `filterable`.'
    },
    sort: { label: 'Sort only', note: '`sortable`.' },
    some: {
      label: 'Some columns',
      note: 'A column with `sortable: false` and `filterable: false` offers neither.'
    },
    search: {
      label: 'Global search',
      note: '`search` names the fields; the `toolbar` slot draws the input.'
    },
    none: { label: 'None', note: 'Neither `sortable` nor `filterable`.' }
  }),
  columns: axis('Columns', {
    auto: {
      label: 'Automatic width',
      note: '`autoWidth`: each column as wide as its content.'
    },
    fixed: { label: 'Fixed width', note: 'A `width` on every column.' },
    resize: {
      label: 'Resizable',
      note: '`resizable` and `v-model:columns`.'
    },
    pinned: {
      label: 'Actions pinned right',
      note: 'An actions column with `pinned: "right"`.'
    },
    narrow: {
      label: 'Scrolls sideways',
      note: 'More columns than the box is wide: the table scrolls in it.'
    }
  }),
  rows: axis('Rows', {
    plain: { label: 'Plain', note: 'No row behavior.' },
    link: {
      label: 'Clickable',
      note: 'A link in a cell slot opens the row; `rowNavigation` focuses it.'
    },
    keyboard: {
      label: 'Keyboard',
      note: '`rowNavigation`: arrow keys move between rows (C-109).'
    },
    grouped: {
      label: 'Grouped',
      note: '`groupBy` on rows sorted by group, and a `group` slot (C-103).'
    },
    pinned: {
      label: 'Pinned',
      note: '`v-model:rowPinning` and the `pinRow` of a cell slot (C-74).'
    }
  }),
  header: axis('Header', {
    shown: { label: 'Shown', note: 'The header row and the filter row.' },
    none: { label: 'None', note: '`header: false`: a list (C-121).' },
    scroll: {
      label: 'Scrolling body',
      note: '`scrollBody`: the body scrolls under a fixed header (C-101).'
    }
  }),
  state: axis('State', {
    rows: { label: 'Rows', note: 'The rows drawn.' },
    loading: {
      label: 'Loading',
      note: '`loading` and a `loading` slot drawing a skeleton.'
    },
    empty: { label: 'Empty', note: 'No rows: the `empty` slot.' },
    error: {
      label: 'Query error',
      note: 'A query the evaluator refuses: the `error` slot.'
    }
  }),
  text: axis('Texts', {
    english: { label: 'English', note: 'The default `labels`.' },
    turkish: { label: 'Turkish', note: '`labels` in Turkish (C-44).' }
  })
}

export type AxisId = keyof typeof axes
export type Choice = {
  [A in AxisId]: keyof (typeof axes)[A]['variations']
}

/** The first variation of every axis. */
export const defaultChoice = (): Choice =>
  Object.fromEntries(
    Object.entries(axes).map(([id, { variations }]) => [
      id,
      Object.keys(variations)[0]
    ])
  ) as Choice
