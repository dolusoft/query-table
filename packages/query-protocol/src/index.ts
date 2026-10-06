// @dolusoft/query-protocol: the query a table emits and a server answers,
// with the filter grammar. Zero dependencies, no framework, no DOM (P11).

export type {
  ColumnType,
  CursorQuery,
  CursorRequest,
  FilterColumn,
  FilterCondition,
  FilterConditionOption,
  FilterRule,
  FilterValue,
  PageCursors,
  PageQuery,
  Query,
  QueryChangeReason,
  SortDirection,
  SortState,
  TableQuery
} from './protocol/types'
export {
  columnTypes,
  cursorDirections,
  filterConditions,
  queryChangeReasons,
  sortDirections
} from './protocol/constants'
export {
  cloneQuery,
  isCursorQuery,
  replaceRules,
  rulesOf,
  sameQuery,
  sameRules,
  searchOf,
  withSearch
} from './protocol/query'

export { columnTypeOf } from './grammar/column-type'
export {
  conditionLabel,
  conditionOptions,
  defaultConditionFor
} from './grammar/conditions'
export {
  type Draft as FilterDraft,
  draftFromRules,
  hasContent as draftHasContent,
  parseDraft
} from './grammar/draft'
export { parseFilterInput } from './grammar/parse-filter-input'
export {
  hasShortcut,
  type ParsedRule,
  parseShortcuts,
  previewCondition,
  serializeFilterRules
} from './grammar/shortcuts'
