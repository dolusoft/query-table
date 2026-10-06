// @dolusoft/query-table-core/server-query: the plugin that turns TanStack's
// sort, filter, page and global filter actions into query updates.
import './types'

export { dispose } from '../../shared'
export {
  applyColumnFilters,
  fromSorting,
  pageCountOf,
  projectServerQuery,
  type ServerQueryInput,
  type ServerQueryState,
  toColumnFilters,
  toPageCount,
  toPagination,
  toSorting
} from './projection'
export { serverQueryFeature } from './server-query-feature'
export type {
  ServerQueryColumnApi,
  ServerQueryTableApi,
  ServerQueryOptions
} from './types'
