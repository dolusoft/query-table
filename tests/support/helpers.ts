import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import TestTable from './harness/TestTable.vue'
import type {
  Column,
  FilterRule,
  QueryChangeReason,
  TableQuery
} from '../../src/contract'

export const columns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'number' },
  { field: 'joined', title: 'Joined', type: 'date' }
]

export const rows = (count = 5) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Name ${i + 1}`,
    age: 20 + i,
    joined: `2024-0${(i % 9) + 1}-1${i % 9}`
  }))

export const makeQuery = (overrides: Partial<TableQuery> = {}): TableQuery => ({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: [],
  ...overrides
})

export const rule = (
  field: string,
  condition: FilterRule['condition'],
  value: FilterRule['value']
): FilterRule => ({ field, condition, value })

export interface RecordedUpdate {
  /** Milliseconds since the table was rendered. */
  at: number
  query: TableQuery
  reason: QueryChangeReason
}

/**
 * Renders the table inside a consumer that applies every update (like
 * `v-model:query`) and records each one with a timestamp, so tests can assert
 * on debounce timing.
 */
export const renderTable = async (props: Record<string, unknown> = {}) => {
  const updates: RecordedUpdate[] = []
  const t0 = performance.now()
  const screen = await render(TestTable as never, {
    props: {
      query: makeQuery(),
      columns: columns(),
      rows: rows(),
      totalRows: 50,
      sortable: true,
      filterable: true,
      record: (query: TableQuery, reason: QueryChangeReason) =>
        updates.push({ at: performance.now() - t0, query, reason }),
      ...props
    } as never
  })
  const filterInput = (field: string) =>
    page.getByCSS(`th[data-field="${field}"] .bh-filter-input`)
  const filterButton = (field: string) =>
    page.getByCSS(`th[data-field="${field}"] .bh-filter-button`)
  const rulesOf = (update: RecordedUpdate, field: string) =>
    update.query.filters.filter(item => item.field === field)
  // `render` is typed against the harness loosely above; keep `rerender` usable.
  const rerender = (next: Record<string, unknown>) =>
    screen.rerender(next as never)
  return { screen, rerender, updates, filterInput, filterButton, rulesOf, t0 }
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The element behind a selector, for geometry. */
export const el = <E extends Element = HTMLElement>(css: string) => {
  const found = document.querySelector<E>(css)
  if (!found) {
    throw new Error(`nothing matches ${css}`)
  }
  return found
}

/**
 * Saves a full-page PNG to tests/browser/__screenshots__/ (gitignored) for a
 * human or an agent to look at. Not a visual baseline: nothing compares it.
 */
export const shot = (name: string) =>
  page.screenshot({ path: `__screenshots__/${name}.png` })
