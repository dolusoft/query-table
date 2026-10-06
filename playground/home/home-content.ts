import api from '../../contract/api.json'
import { version } from '../../package.json'

// The text of the home page, in one place: the page renders it and the
// documentation search indexes it (search/search-index.ts), so a search for
// "headless" or "architecture" finds the home page section that says it.

export const repositoryUrl = 'https://github.com/dolusoft/query-table'

export const pitch =
  'A headless Vue 3 table for server-side data. It draws the rows you send and tells you, through v-model:query, which page, sort and filters the user asked for.'

/** The package is published as a GitHub release tarball, not on npm. */
export const installCommand = `pnpm add ${repositoryUrl}/releases/download/v${version}/dolusoft-query-table-${version}.tgz`

export { version }

export interface HomeSection {
  /** Element id on the home page, the search anchor. */
  id: string
  title: string
  text: string
}

/** What the showcase table uses, each with the page that documents it. */
export const showcaseFeatures: Array<{ label: string; pageId: string }> = [
  { label: 'Server-side paging', pageId: 'pagination' },
  { label: 'Sorting', pageId: 'sorting' },
  { label: 'Filter grammar', pageId: 'filtering' },
  { label: 'Condition menu', pageId: 'filtering' },
  { label: 'Pinned columns', pageId: 'column-pinning' },
  { label: 'Resizable columns', pageId: 'column-resizing' },
  { label: 'Nested rows', pageId: 'row-expansion' },
  { label: 'Cell slots', pageId: 'custom-cells' },
  { label: 'Footer totals', pageId: 'footer-rows' },
  { label: 'Loading slot', pageId: 'loading-state' },
  { label: 'Compact mode', pageId: 'overview' }
]

export const showcase: HomeSection = {
  id: 'showcase',
  title: 'One table, most of the features',
  text: 'A fake server answers every query after a short delay: it filters, sorts and pages 200 people. ID and Name stay pinned while the table scrolls sideways, header edges resize the columns, each row opens its orders in a nested table, and the footer sums the salary over every match. Narrower than 640 pixels the table switches to compact headers, filter chips and a filter sheet.'
}

/** Features with a page of their own that the showcase does not use. */
export const moreFeatures: Array<HomeSection & { pageId: string }> = [
  {
    id: 'feature-query-model',
    pageId: 'query-model',
    title: 'Query v-model',
    text: 'One plain object holds the page, page size, sort and filters, and every update comes with its reason. Save it, reset it from outside or send it to the server as it is.'
  },
  {
    id: 'feature-programmatic-control',
    pageId: 'programmatic-control',
    title: 'Programmatic control',
    text: 'Methods on the template ref put the caret in a filter and open or close every row, from your own buttons and shortcuts.'
  },
  {
    id: 'feature-filter-parser',
    pageId: 'filter-parser',
    title: 'Filter parser',
    text: 'The function the filter row uses is exported: turn typed text into the same filter rules anywhere in your app.'
  },
  {
    id: 'feature-header-slot',
    pageId: 'header-slot',
    title: 'Header slot',
    text: 'Replace the label of one header with your own markup; the sort button, the filter row and the resize handle stay.'
  },
  {
    id: 'feature-row-events',
    pageId: 'custom-cells',
    title: 'Row and cell events',
    text: 'A right click on a cell and the right-panel button of a row emit events with the row, the column and the value.'
  },
  {
    id: 'feature-labels',
    pageId: 'labels',
    title: 'Labels & accessibility',
    text: 'Every text the table writes comes from labels you can replace, and every control has an accessible name.'
  }
]

export const principles: HomeSection[] = [
  {
    id: 'principle-headless',
    title: 'Headless',
    text: 'The table renders plain markup and your slots. Cells, headers, menus, the pager and the empty state are yours to draw with your own components.'
  },
  {
    id: 'principle-no-css',
    title: 'No CSS',
    text: 'The package ships no stylesheet and no runtime dependency besides Vue. A small, stable set of qt- classes and data attributes is all a skin selects.'
  },
  {
    id: 'principle-server-first',
    title: 'Server-first',
    text: 'The table never sorts, filters or pages rows. It emits what the user asked for and draws the rows the server sends back.'
  },
  {
    id: 'principle-contract-tested',
    title: 'Contract-tested',
    text: `The public API, the DOM hooks and ${api.rules.length} behavior rules are written down, and the test suite fails when a rule has no test that names it.`
  }
]

export const architecture: HomeSection = {
  id: 'architecture',
  title: 'Architecture',
  text: 'Your page owns the query and the rows. The table turns clicks and typing into a new query and emits it through v-model:query; your code sends that query to the server and passes the answer back as rows and totalRows. The table keeps no copy of the data and no state that outlives an emit: what it draws always comes from the props you hold.'
}

/** Sections of the home page in the order they render, for the search. */
export const homeSections: HomeSection[] = [
  showcase,
  ...moreFeatures,
  ...principles,
  architecture
]
