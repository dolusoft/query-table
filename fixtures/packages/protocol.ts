// A consumer of the protocol only (a server, a URL codec, a form): builds a
// query, compares it and parses filter text with the table's grammar.
import {
  cloneQuery,
  parseFilterInput,
  type Query,
  sameQuery
} from '@dolusoft/query-protocol'

const query: Query = {
  page: 1,
  pageSize: 20,
  sort: { field: 'name', direction: 'asc' },
  filters: parseFilterInput(location.hash, { field: 'name' })
}
document.body.textContent = JSON.stringify([
  cloneQuery(query),
  sameQuery(query, cloneQuery(query))
])
