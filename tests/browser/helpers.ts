import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import VueServerTable from '../../src/components/index'
import type { ColumnDefinition } from '../../src/model/column-model'

const columns = (): ColumnDefinition[] => [
  { field: 'id', title: 'ID', type: 'number' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'number' }
]

export const rows = (count = 5) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Name ${i + 1}`,
    age: 20 + i
  }))

export interface RecordedChange {
  /** Milliseconds since the table was rendered. */
  at: number
  payload: any
}

/**
 * Renders the table the way a server-mode consumer does and records every
 * `change` payload with a timestamp, so tests can assert on debounce timing.
 */
export const renderTable = async (props: Record<string, any> = {}) => {
  const changes: RecordedChange[] = []
  const t0 = performance.now()
  const screen = await render(VueServerTable as any, {
    props: {
      columns: columns(),
      rows: rows(),
      totalRows: 50,
      sortable: true,
      columnFilter: true,
      onChange: (payload: any) =>
        changes.push({ at: performance.now() - t0, payload }),
      ...props
    }
  })
  const filterInput = (field: string) =>
    page.getByCSS(`th[data-field="${field}"] input`)
  const filterOf = (change: RecordedChange, field: string) =>
    change.payload.column_filters.find((c: any) => c.field === field)
  return { screen, changes, filterInput, filterOf, t0 }
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Saves a full-page PNG to tests/browser/__screenshots__/ (gitignored) for a
 * human or an agent to look at. Not a visual baseline: nothing compares it.
 */
export const shot = (name: string) =>
  page.screenshot({ path: `__screenshots__/${name}.png` })
