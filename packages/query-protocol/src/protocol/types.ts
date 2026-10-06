import type {
  columnTypes,
  cursorDirections,
  filterConditions,
  queryChangeReasons,
  sortDirections
} from './constants'

/**
 * Comparison applied to a column. A column with no rule is not filtered, so
 * "no filter" is not a condition.
 */
export type FilterCondition = (typeof filterConditions)[number]

/**
 * Value of a rule: text columns give a string, `number` and `integer` columns
 * a number, `date` and `datetime` columns a string, `bool` columns a boolean.
 */
export type FilterValue = string | number | boolean

/**
 * One clean filter rule. Operator shortcuts the user types (`*`, `!`, `,`) are
 * parsed by the grammar and never appear here.
 *
 * Several rules may share one `field` (the user typed `a,b`). They combine
 * with OR; when every rule of the field is negative (`NotEqual`,
 * `NotContains`) they combine with AND. Rules of different fields combine
 * with AND. The table does not evaluate rules, the server does.
 *
 * Properties besides these three are kept as they are: the table copies them
 * and never drops them.
 */
export interface FilterRule {
  /** Column `field` the rule applies to. */
  field: string
  condition: FilterCondition
  /** A non-empty value. */
  value: FilterValue
}

export type SortDirection = (typeof sortDirections)[number]

export interface SortState {
  /** Column `field` the rows are ordered by. */
  field: string
  direction: SortDirection
}

/** What the user did to produce an update. */
export type QueryChangeReason = (typeof queryChangeReasons)[number]

/** Data type of a column; it picks the filter grammar and default condition. */
export type ColumnType = (typeof columnTypes)[number]

/** What the query has in both paging modes. */
interface QueryBase {
  pageSize: number
  /** `null` means unsorted. */
  sort: SortState | null
  filters: FilterRule[]
  /**
   * Global search text (K6). Absent or `''` means no search; the table never
   * emits `''`, it leaves the key out.
   */
  search?: string
}

/**
 * Page mode: the query names a page number. This is the 2.2 `TableQuery`
 * with the optional `search`.
 */
export interface PageQuery extends QueryBase {
  /** 1-based page number. */
  page: number
}

/** The 2.2 name of a page-mode query. */
export type TableQuery = PageQuery

/** Which page of a cursor-paged result to fetch (K6). */
export interface CursorRequest {
  /** A cursor the server answered with (`PageCursors`). */
  token: string
  /** The side of the current page the cursor leads to. */
  direction: (typeof cursorDirections)[number]
}

/**
 * Cursor mode: the server pages by opaque cursors and the total may be
 * unknown. The query names the cursor to follow; `null` is the first page.
 * A query is in cursor mode when it has a `cursor` key.
 */
export interface CursorQuery extends QueryBase {
  cursor: CursorRequest | null
}

/**
 * Everything the user can change about what the table shows. The consumer
 * owns it; the table reads it and emits new objects. Keys the protocol does
 * not know are kept as they are.
 */
export type Query = PageQuery | CursorQuery

/**
 * The cursors the server answered with for the page shown (cursor mode).
 * `null` means there is no page on that side.
 */
export interface PageCursors {
  next: string | null
  prev: string | null
}

/** One entry of the condition list offered for a column. */
export interface FilterConditionOption {
  value: FilterCondition
  /** English label, for example `'Starts With'`. */
  label: string
}

/**
 * The part of a column the grammar reads. A wider column type (the Vue
 * package's `Column`) is accepted as it is.
 */
export interface FilterColumn {
  /** The `field` of the rules the column's text becomes. */
  field: string
  /** Defaults to `'string'`. Case-insensitive at runtime. */
  type?: ColumnType
}
