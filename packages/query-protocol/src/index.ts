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
  NoValueCondition,
  NoValueFilterRule,
  PageCursors,
  PageQuery,
  Query,
  QueryBase,
  QueryChangeReason,
  RangeCondition,
  RangeFilterRule,
  SortDirection,
  SortState,
  TableQuery,
  ValueCondition,
  ValueFilterRule
} from './protocol/types'
export {
  columnTypes,
  cursorDirections,
  filterConditions,
  noValueConditions,
  queryChangeReasons,
  rangeConditions,
  sortDirections
} from './protocol/constants'
export { conditionArity } from './protocol/arity'
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
  defaultConditionFor,
  defaultConditionOf
} from './grammar/conditions'
export {
  type Draft as FilterDraft,
  type Parsed,
  draftFromRules,
  hasContent as draftHasContent,
  parseDraft,
  rulesFromDraft
} from './grammar/draft'
export { parseFilterInput } from './grammar/parse-filter-input'
export {
  hasShortcut,
  type ParsedRule,
  parseShortcuts,
  previewCondition,
  serializeFilterRules
} from './grammar/shortcuts'
