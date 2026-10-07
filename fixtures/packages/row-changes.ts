// A headless consumer of the row-change tracker alone (ADR 0011): compares
// two lists of rows by key, no table, no framework.
import { createRowChangeTracker } from '@dolusoft/query-table-core/row-changes'

interface Row {
  id: number
  price: number
}

const tracker = createRowChangeTracker<Row>(row => row.id)
const base = {
  query: { page: 1, pageSize: 20, sort: null, filters: [] },
  loading: false,
  fields: ['price'],
  hint: 'live' as const,
  quiet: false
}
tracker.update({ ...base, rows: [{ id: 1, price: 1 }] })
const changes = tracker.update({
  ...base,
  rows: [
    { id: 1, price: Number(location.hash.slice(1)) },
    { id: 2, price: 2 }
  ]
})
document.body.textContent = JSON.stringify([
  changes.added,
  [...changes.changed]
])
