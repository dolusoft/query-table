import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import { columns, makeQuery, rows } from './fixtures'
import TestTable from '../../playground/harness/TestTable.vue'
import type { QueryChangeReason, TableQuery } from '../../src/contract'

export { columns, el, rows, rule, sleep } from './fixtures'

export interface RecordedUpdate {
  /** Milliseconds since the table was rendered. */
  at: number
  query: TableQuery
  reason: QueryChangeReason
}

/**
 * Renders the table, styled by the playground skin, inside a consumer that
 * applies every update (like `v-model:query`) and records each one with a
 * timestamp, so tests can assert on debounce timing.
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
    page.getByCSS(`th[data-field="${field}"] .qt-filter-input`)
  const filterButton = (field: string) =>
    page.getByCSS(`th[data-field="${field}"] .qt-filter-button`)
  const rulesOf = (update: RecordedUpdate, field: string) =>
    update.query.filters.filter(item => item.field === field)
  // `render` is typed against the harness loosely above; keep `rerender` usable.
  const rerender = (next: Record<string, unknown>) =>
    screen.rerender(next as never)
  return { screen, rerender, updates, filterInput, filterButton, rulesOf, t0 }
}

/**
 * Saves a full-page PNG to tests/browser/__screenshots__/ (gitignored) for a
 * human or an agent to look at. Not a visual baseline: nothing compares it.
 */
export const shot = (name: string) =>
  page.screenshot({ path: `__screenshots__/${name}.png` })
