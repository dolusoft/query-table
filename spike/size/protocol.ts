// A consumer of the protocol layer only: builds a query, reads it, parses
// filter text with the table's grammar (a server, a URL codec, a form).
import { parseFilterInput } from '../../src/filter/parse-filter-input'
import { cloneQuery, sameQuery, type SpikeQuery } from '../core/query'

const query: SpikeQuery = {
  page: 1,
  pageSize: 20,
  sort: { field: 'name', direction: 'asc' },
  filters: parseFilterInput(location.hash, { field: 'name' })
}
document.body.textContent = JSON.stringify([
  cloneQuery(query),
  sameQuery(query, cloneQuery(query))
])
