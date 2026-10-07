// @dolusoft/query-table-core: the headless core of a server-side table. Two
// TanStack Table plugins, each also on its own subpath
// (`/server-query`, `/filter-input`), and the shared contract between them;
// the row-change tracker, a pure module also on `/row-changes` (ADR 0011).
// No framework, no DOM (P11).
import './features/filter-input/types'
import './features/server-query/types'

export {
  createRowChangeTracker,
  type RowChangeInput,
  type RowChangeKey,
  type RowChanges,
  type RowChangeTracker,
  type RowsUpdate,
  sameValue
} from './row-changes'

export { filterInputFeature } from './features/filter-input/filter-input-feature'
export type {
  FilterInputColumnApi,
  FilterInputColumnDef,
  FilterDrafts,
  FilterLabel,
  FilterInputTableApi,
  FilterInputOptions,
  FilterInputState
} from './features/filter-input/types'
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
} from './features/server-query/projection'
export { serverQueryFeature } from './features/server-query/server-query-feature'
export type {
  ServerQueryColumnApi,
  ServerQueryTableApi,
  ServerQueryOptions
} from './features/server-query/types'
export { dispose } from './shared'
