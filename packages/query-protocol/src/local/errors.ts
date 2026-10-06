// The errors the local evaluator returns as values (semantics.md#errors).
// The code and the location fields are part of the conformance suite; the
// message is not.

/** What went wrong; the codes are part of the conformance suite. */
export type LocalQueryErrorCode =
  | 'unknown-profile'
  | 'invalid-query'
  | 'cursor-not-supported'
  | 'invalid-page'
  | 'unsupported-extension'
  | 'unknown-field'
  | 'unsupported-field'
  | 'unsupported-operator'
  | 'invalid-value'
  | 'search-not-supported'
  | 'invalid-data'
  | 'duplicate-key'

/** The first problem found, in the validation order of the profile. */
export interface LocalQueryError {
  /** Compared by programs; `message` is not. */
  code: LocalQueryErrorCode
  /** English, for logs; never shown as is and never compared. */
  message: string
  /** JSON Pointer into the query (`/filters/2/value`), for a query error. `''` is the query itself. */
  path?: string
  /** The dataset field involved, when there is one. */
  field?: string
  /** Index into `query.filters`, for a rule error. */
  rule?: number
  /** Zero-based index into `allRows`, for a data error. */
  row?: number
  /** The key or condition, for `unsupported-extension`. */
  name?: string
}

/** Every row asked for, or the first error; never a partial result. */
export type LocalQueryResult<T> =
  | { ok: true; rows: T[]; totalRows: number }
  | { ok: false; error: LocalQueryError }

export type Failure = { ok: false; error: LocalQueryError }

type Location = Omit<LocalQueryError, 'code' | 'message'>

/** A failure with only the location fields that are set. */
export const fail = (
  code: LocalQueryErrorCode,
  location: Location,
  message: string
): Failure => {
  const error: LocalQueryError = { code, message }
  if (location.path !== undefined) {
    error.path = location.path
  }
  if (location.field !== undefined) {
    error.field = location.field
  }
  if (location.rule !== undefined) {
    error.rule = location.rule
  }
  if (location.row !== undefined) {
    error.row = location.row
  }
  if (location.name !== undefined) {
    error.name = location.name
  }
  return { ok: false, error }
}
