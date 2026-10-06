// A consumer of the local evaluator (C-75, C-76): one dataset and one
// evaluation, so the measure is the cost of a real use of the /local entry.
import { applyQuery, defineDataset } from '@dolusoft/query-protocol/local'

const dataset = defineDataset({
  key: 'id',
  fields: {
    id: { type: 'integer' },
    name: { type: 'string', search: true }
  }
})

document.body.textContent = JSON.stringify(
  applyQuery([], { page: 1, pageSize: 20, sort: null, filters: [] }, dataset, {
    profile: 'tr-1'
  })
)
