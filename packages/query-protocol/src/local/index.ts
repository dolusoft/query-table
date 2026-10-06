// @dolusoft/query-protocol/local: evaluates a query over rows held in
// memory, with a named semantics profile. A data-source helper, not table
// behaviour: the default entry never exports or imports it (C-75, ADR 0008).
// Zero dependencies; it reaches only protocol/{types,constants,query}.
//
// The text and time primitives (folding, comparison, parsing) are not
// exported: opened, they would have to be versioned as part of the profile.

export type { SemanticsProfile } from './profiles'
export { profiles, reservedQueryKeys } from './profiles'
export type { Dataset, DatasetField } from './dataset'
export { defineDataset } from './dataset'
export type { ApplyQueryOptions } from './apply-query'
export type {
  LocalQueryError,
  LocalQueryErrorCode,
  LocalQueryResult
} from './errors'
export { applyQuery, slicePage } from './apply-query'
