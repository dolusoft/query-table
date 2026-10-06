// @dolusoft/query-table-core/filter-input: the plugin that turns the text
// typed per column into filter rules (the protocol's grammar).
import './types'

export { dispose } from '../../shared'
export { filterInputFeature } from './filter-input-feature'
export type {
  FilterInputColumnApi,
  FilterInputColumnDef,
  FilterDrafts,
  FilterLabel,
  FilterInputTableApi,
  FilterInputOptions,
  FilterInputState
} from './types'
