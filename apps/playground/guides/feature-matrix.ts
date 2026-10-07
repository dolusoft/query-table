// The feature matrix: one data file that the "Features" page draws and
// feature-matrix.spec.ts checks. A row says whether TanStack Table has the
// feature, where Query Table offers it today and what it takes on the server.

/**
 * Where a feature can be used. `later` is further out, `recipe` is built
 * from the slots and state in the playground, not shipped.
 */
export type Availability = 'yes' | 'later' | 'recipe' | 'no'

/**
 * What a feature takes when the data lives on a server:
 * `server` works as the query goes to the server, `backend` needs the server
 * to implement it, `client` works on rows that are all in the browser only.
 */
export type ServerMode = 'server' | 'backend' | 'client'

export type FeatureGroup = 'open' | 'backend' | 'client' | 'own'

export interface Feature {
  /** Element id suffix on the page, the search anchor. */
  id: string
  group: FeatureGroup
  title: string
  summary: string
  /** The TanStack feature behind it (an `id` of `tanstackFeatureGuides`), if TanStack has one. */
  tanstack: string | null
  /** The `QueryTable` component and `useQueryTable()`. */
  component: Availability
  /** TanStack Table with `serverQueryFeature` / `filterInputFeature`. */
  tanstackPath: Availability
  /** `null` when the question does not apply (a UI or process feature). */
  mode: ServerMode | null
  /** A playground page id (manifest) that shows it live. */
  example?: string
  /** A file of the repository that explains it. */
  repoPath?: string
}

export const serverModeLabels: Record<ServerMode, string> = {
  server: 'Works on the server',
  backend: 'Needs backend support',
  client: 'Client data only'
}

export const availabilityLabels: Record<Availability, string> = {
  yes: 'Yes',
  later: 'Later',
  recipe: 'Recipe',
  no: 'No'
}

export const groupTitles: Record<FeatureGroup, string> = {
  open: 'Open in Query Table today',
  backend: 'Needs support from your backend',
  client: 'Client-side data only',
  own: 'Only in Query Table'
}

export const groupNotes: Record<FeatureGroup, string> = {
  open: 'TanStack Table has these and Query Table turns them into one query the server answers.',
  backend:
    'TanStack has them, but the table cannot do them for rows it does not hold: the server must group, total or count, and the query has no way to ask yet.',
  client:
    'They run over every row in the browser, so they only make sense when all rows are loaded.',
  own: 'What TanStack Table does not have and Query Table adds on top of it.'
}

export const featureGroups: FeatureGroup[] = [
  'open',
  'backend',
  'client',
  'own'
]

export const features: Feature[] = [
  // A: open today
  {
    id: 'sorting',
    group: 'open',
    title: 'Sorting',
    summary:
      'One sort at a time: ascending, descending, none. The click emits `query.sort`.',
    tanstack: 'sorting',
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'sorting'
  },
  {
    id: 'pagination',
    group: 'open',
    title: 'Pagination (offset and cursor)',
    summary:
      'A page number and page size, or an opaque cursor when the total is unknown.',
    tanstack: 'pagination',
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'pagination'
  },
  {
    id: 'column-filtering',
    group: 'open',
    title: 'Column filtering',
    summary:
      'Filter rules per column with ten conditions; the server evaluates them.',
    tanstack: 'column-filtering',
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'filtering'
  },
  {
    id: 'global-search',
    group: 'open',
    title: 'Global search',
    summary:
      'One search text in `query.search`; the server decides what it matches.',
    tanstack: 'global-filtering',
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'search-selection-cursors'
  },
  {
    id: 'row-selection',
    group: 'open',
    title: 'Row selection',
    summary:
      'A controlled map of row key to `true`; keys of other pages stay in it.',
    tanstack: 'row-selection',
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'search-selection-cursors'
  },
  {
    id: 'row-expanding',
    group: 'open',
    title: 'Row expanding',
    summary:
      'A nested table or any content under a row; it opens the rows given and fetches nothing.',
    tanstack: 'expanding',
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'row-expansion'
  },
  {
    id: 'column-pinning-left',
    group: 'open',
    title: 'Pinning columns to the left',
    summary:
      'Pinned columns come first and the table measures their sticky offsets.',
    tanstack: 'column-pinning',
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'column-pinning'
  },
  {
    id: 'column-pinning-right',
    group: 'open',
    title: 'Pinning columns to the right',
    summary:
      "`pinned: 'right'`: drawn last, with the measured `--qt-pin-right` offset.",
    tanstack: 'column-pinning',
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'column-pinning'
  },
  {
    id: 'column-visibility',
    group: 'open',
    title: 'Column visibility',
    summary:
      'Hide a column from its header or filter menu (`control.hide()`); your own column picker shows it again by writing `columns`. The table emits `update:columns`.',
    tanstack: 'column-visibility',
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'column-layout'
  },
  {
    id: 'column-ordering',
    group: 'open',
    title: 'Column order',
    summary:
      'Move a column within its region by dragging its handle, with the arrow keys, Home and End, or from a menu (`control.move`). The table emits `update:columns`.',
    tanstack: 'column-ordering',
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'column-layout'
  },
  {
    id: 'column-sizing',
    group: 'open',
    title: 'Column sizing and resizing',
    summary:
      'Drag or keyboard handles on the header; the consumer keeps the widths. On the TanStack path use TanStack’s own column resizing.',
    tanstack: 'column-resizing',
    component: 'yes',
    tanstackPath: 'no',
    mode: 'server',
    example: 'column-resizing'
  },
  {
    id: 'row-pinning',
    group: 'open',
    title: 'Row pinning',
    summary:
      'A controlled map of row keys pinned to the top or bottom of the page; keys of other pages stay in it.',
    tanstack: 'row-pinning',
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'row-pinning'
  },
  // B: backend support
  {
    id: 'grouping',
    group: 'backend',
    title: 'Grouping and aggregation',
    summary:
      'Group rows by a column and total each group: only the server sees every row.',
    tanstack: 'grouping',
    component: 'no',
    tanstackPath: 'no',
    mode: 'backend'
  },
  {
    id: 'faceting',
    group: 'backend',
    title: 'Faceting',
    summary:
      'Distinct values and counts of a column for a filter list: the server has to count them.',
    tanstack: 'column-faceting',
    component: 'no',
    tanstackPath: 'no',
    mode: 'backend'
  },
  // C: client data only
  {
    id: 'local-query',
    group: 'client',
    title: 'Local evaluation of the query (opt-in /local entries)',
    summary:
      'A separate tr-1 data source evaluates all loaded rows; the table still only renders the supplied page.',
    tanstack: null,
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'client',
    example: 'local-query',
    repoPath: 'skills/query-table/references/local-query.md'
  },
  {
    id: 'fuzzy-search',
    group: 'client',
    title: 'Fuzzy search',
    summary:
      'Ranks rows by similarity on the client; a server search is `query.search`.',
    tanstack: 'fuzzy-filtering',
    component: 'no',
    tanstackPath: 'no',
    mode: 'client'
  },
  {
    id: 'client-functions',
    group: 'client',
    title: 'Client-side filter and sort functions',
    summary:
      '`filterFns` and `sortFns` run over every row; Query Table turns them off (`manual*`).',
    tanstack: 'column-filtering',
    component: 'no',
    tanstackPath: 'no',
    mode: 'client'
  },
  // D: only ours
  {
    id: 'virtualization',
    group: 'own',
    title: 'Virtual scrolling',
    summary:
      'Draw only the rows in view between two spacer rows, with measured heights, a kept focus and printing of every row. Our own windowing code, not TanStack Virtual (ADR 0010); the rows may come from the server or from the browser.',
    tanstack: null,
    component: 'yes',
    tanstackPath: 'no',
    mode: 'server',
    example: 'virtual-scroll'
  },
  {
    id: 'infinite-scroll',
    group: 'own',
    title: 'Infinite scroll',
    summary:
      'Ask for the next page as the end of the rows comes near and append it; a sort or a filter starts over. Page or cursor mode, with a `load-more` row for a retry.',
    tanstack: null,
    component: 'yes',
    tanstackPath: 'no',
    mode: 'server',
    example: 'infinite-scroll'
  },
  {
    id: 'change-flash',
    group: 'own',
    title: 'Change flash',
    summary:
      'Flash a new row and a changed cell while the query stays the same; a sort, a filter or an answer never flashes. The table finds the change by row key and marks it, the skin draws it, and a row that scrolls back into view flashes for the time it has left. Off by default and free while off (ADR 0011).',
    tanstack: null,
    component: 'yes',
    tanstackPath: 'no',
    mode: 'server',
    example: 'change-flash'
  },
  {
    id: 'filter-grammar',
    group: 'own',
    title: 'Filter text grammar, condition menu, debounce, echo guard',
    summary:
      'Type `*foo*`, `!foo` or `a,b` and get clean rules; a condition menu picks the rest. Typing is debounced and the answer to your own update never rewrites the input.',
    tanstack: null,
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'filtering'
  },
  {
    id: 'query-protocol',
    group: 'own',
    title: 'Server Query protocol, JSON Schema and a .NET example',
    summary:
      'The query is plain JSON with a JSON Schema; the guide has a .NET project that validates it.',
    tanstack: null,
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    repoPath: 'docs/guide/protocol.md'
  },
  {
    id: 'one-action-one-update',
    group: 'own',
    title: 'One action, one update, with a reason',
    summary:
      'Every user action emits one `update:query` with a `reason`; a pending filter goes first, in its own update.',
    tanstack: null,
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'query-model'
  },
  {
    id: 'cursor-protocol',
    group: 'own',
    title: 'Cursor protocol',
    summary:
      'Opaque cursors with a direction and a consumer-owned `prev`, for results with no known total.',
    tanstack: null,
    component: 'yes',
    tanstackPath: 'yes',
    mode: 'server',
    example: 'search-selection-cursors'
  },
  {
    id: 'pin-offsets',
    group: 'own',
    title: 'Measured sticky offsets for pinned columns',
    summary:
      'A column width in CSS units (`12rem`, `20%`) is fine: the table measures the rendered widths, for `--qt-pin-left` and `--qt-pin-right` alike.',
    tanstack: null,
    component: 'yes',
    tanstackPath: 'no',
    mode: null,
    example: 'column-pinning'
  },
  {
    id: 'keyboard-resize',
    group: 'own',
    title: 'Keyboard and accessible resizing, with consumer veto',
    summary:
      'Arrow keys, Enter to fit, a separator role with values; the width only changes when you write it back.',
    tanstack: null,
    component: 'yes',
    tanstackPath: 'no',
    mode: null,
    example: 'column-resizing'
  },
  {
    id: 'phone-mode',
    group: 'own',
    title: 'Phone mode: filter chips and a sheet',
    summary:
      'Narrower than 640 px the table switches to compact headers, filter chips and a filter sheet. They are built from the table’s slots in the playground harness; the package stays headless.',
    tanstack: null,
    component: 'recipe',
    tanstackPath: 'recipe',
    mode: null,
    example: 'overview'
  },
  {
    id: 'contract-tests',
    group: 'own',
    title: 'Contract tests',
    summary:
      'The API, the DOM hooks and the behavior rules are written down and the build fails when a rule has no test.',
    tanstack: null,
    component: 'yes',
    tanstackPath: 'yes',
    mode: null,
    repoPath: 'contract/rules.md'
  }
]
