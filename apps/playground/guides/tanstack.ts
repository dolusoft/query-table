import core from '../../../packages/query-table-core/package.json'
import vue from '../../../packages/vue/package.json'

// What the playground says about TanStack Table: the pinned versions (read
// from the package manifests, never typed here), the TanStack features Query
// Table builds on and the v9 documentation pages that explain them. The
// feature list is checked against `useQueryTable()` by tanstack.spec.ts, the
// links against the network by `pnpm check:links`.

export const tanstackVersions = {
  tableCore: core.dependencies['@tanstack/table-core'],
  vueTable: vue.dependencies['@tanstack/vue-table']
}

const docs = 'https://tanstack.com/table/v9/docs'

export interface TanstackLink {
  /** Element id suffix on the TanStack page, the search anchor. */
  id: string
  title: string
  url: string
  /** What the page is for, one line. */
  about: string
}

/** The v9 documentation in general, and the Vue adapter. */
export const tanstackGeneralLinks: TanstackLink[] = [
  {
    id: 'overview',
    title: 'Overview',
    url: `${docs}/overview`,
    about: 'What TanStack Table is and how v9 is organized.'
  },
  {
    id: 'installation',
    title: 'Installation',
    url: `${docs}/installation`,
    about: 'Install `@tanstack/table-core` or a framework adapter.'
  },
  {
    id: 'vue-overview',
    title: 'Vue adapter overview',
    url: `${docs}/framework/vue/overview`,
    about: 'The `@tanstack/vue-table` adapter and `useTable`.'
  },
  {
    id: 'vue-installation',
    title: 'Vue adapter installation',
    url: `${docs}/framework/vue/installation`,
    about: 'Install the Vue adapter.'
  },
  {
    id: 'features',
    title: 'Features guide',
    url: `${docs}/guide/features`,
    about: 'Every feature of the table and how to register it.'
  },
  {
    id: 'tables',
    title: 'Tables guide',
    url: `${docs}/guide/tables`,
    about: 'Table instance, options and state.'
  },
  {
    id: 'table-state',
    title: 'Table state (Vue)',
    url: `${docs}/framework/vue/guide/table-state`,
    about: 'Controlled and uncontrolled state, the model Query Table uses.'
  },
  {
    id: 'server-side',
    title: 'Client-side vs server-side',
    url: `${docs}/guide/client-side-vs-server-side`,
    about: 'The `manual*` options Query Table sets for you.'
  },
  {
    id: 'custom-features',
    title: 'Custom features (Vue)',
    url: `${docs}/framework/vue/guide/custom-features`,
    about: 'How a plugin such as `serverQueryFeature` is written.'
  },
  {
    id: 'reference',
    title: 'API reference',
    url: `${docs}/reference/index`,
    about: 'Generated API reference.'
  }
]

export interface TanstackFeatureGuide extends TanstackLink {
  /** The TanStack feature export, when it has one. */
  feature?: string
}

/** The guide page of each TanStack feature (Vue adapter), used or not. */
export const tanstackFeatureGuides: TanstackFeatureGuide[] = (
  [
    ['sorting', 'Sorting', 'rowSortingFeature'],
    ['pagination', 'Pagination', 'rowPaginationFeature'],
    ['column-filtering', 'Column filtering', 'columnFilteringFeature'],
    ['global-filtering', 'Global filtering', 'globalFilteringFeature'],
    ['row-selection', 'Row selection', 'rowSelectionFeature'],
    ['expanding', 'Row expanding', 'rowExpandingFeature'],
    ['column-pinning', 'Column pinning', 'columnPinningFeature'],
    ['row-pinning', 'Row pinning', 'rowPinningFeature'],
    ['column-visibility', 'Column visibility', 'columnVisibilityFeature'],
    ['column-ordering', 'Column ordering', 'columnOrderingFeature'],
    ['column-sizing', 'Column sizing', 'columnSizingFeature'],
    ['column-resizing', 'Column resizing', 'columnResizingFeature'],
    ['grouping', 'Column grouping', 'columnGroupingFeature'],
    ['aggregation', 'Aggregation', 'rowAggregationFeature'],
    ['column-faceting', 'Column faceting', 'columnFacetingFeature'],
    ['fuzzy-filtering', 'Fuzzy filtering', undefined],
    ['virtualization', 'Virtualization', undefined]
  ] satisfies Array<[string, string, string | undefined]>
).map(([id, title, feature]) => ({
  id,
  title,
  feature,
  url: `${docs}/framework/vue/guide/${id}`,
  about: `The ${title.toLowerCase()} guide of the Vue adapter.`
}))

/**
 * The TanStack features Query Table builds on, in the order
 * `useQueryTable()` registers them, and what each one does there.
 * tanstack.spec.ts compares this list with that source.
 */
export const usedTanstackFeatures: Array<{
  feature: string
  guide: string
  role: string
}> = [
  {
    feature: 'rowSortingFeature',
    guide: 'sorting',
    role: 'The sort slice, a projection of `query.sort`; the header click is `column.toggleQuerySorting()`.'
  },
  {
    feature: 'rowPaginationFeature',
    guide: 'pagination',
    role: 'The page slice, a projection of `query.page` or the cursor; page and page size actions become one update.'
  },
  {
    feature: 'columnFilteringFeature',
    guide: 'column-filtering',
    role: 'The filter slice, a projection of `query.filters`; the value of a column is its `FilterRule[]`.'
  },
  {
    feature: 'globalFilteringFeature',
    guide: 'global-filtering',
    role: 'The global search, a projection of `query.search`, in manual mode.'
  },
  {
    feature: 'rowSelectionFeature',
    guide: 'row-selection',
    role: 'The selection slice, controlled by the consumer (`v-model:selection`).'
  },
  {
    feature: 'rowExpandingFeature',
    guide: 'expanding',
    role: 'The expanded rows behind the `subtable` slot, keyed by `rowKey`.'
  },
  {
    feature: 'columnVisibilityFeature',
    guide: 'column-visibility',
    role: 'The visibility slice, a projection of `Column.hide`; `control.hide()` becomes `update:columns`.'
  },
  {
    feature: 'columnOrderingFeature',
    guide: 'column-ordering',
    role: 'The order slice, a projection of the order of `columns`; `control.move()` and the reorder handle (drag, arrow keys, Home, End) become `update:columns`.'
  },
  {
    feature: 'columnPinningFeature',
    guide: 'column-pinning',
    role: 'The regions of pinned columns, a projection of `Column.pinned` (`start` is left, `end` is right); the sticky offsets are measured by the table.'
  }
]
