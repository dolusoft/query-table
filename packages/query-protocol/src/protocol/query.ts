import type {
  CursorQuery,
  FilterRule,
  PageQuery,
  Query,
  SortState
} from './types'

/** A query is in cursor mode when it has a `cursor` key (K6). */
export const isCursorQuery = (query: Query): query is CursorQuery =>
  'cursor' in query

const sameSort = (a: SortState | null, b: SortState | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.field === b.field &&
    a.direction === b.direction)

/** The search text of a query; absent and `''` are both no search. */
export const searchOf = (query: Query): string => query.search ?? ''

const known = new Set([
  'page',
  'cursor',
  'pageSize',
  'sort',
  'filters',
  'search'
])

/** Deep equality of JSON values; key order does not matter. */
const sameJson = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true
  }
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false
  }
  const left = Object.entries(a as Record<string, unknown>)
  const right = b as Record<string, unknown>
  return (
    left.length === Object.keys(right).length &&
    left.every(
      ([key, value]) => Object.hasOwn(right, key) && sameJson(value, right[key])
    )
  )
}

const ruleKeys = new Set(['field', 'condition', 'value'])

/** The own enumerable properties of a rule besides the three it is made of. */
const extraPart = (rule: FilterRule): Record<string, unknown> =>
  Object.fromEntries(Object.entries(rule).filter(([key]) => !ruleKeys.has(key)))

const sameRule = (a: FilterRule, b: FilterRule): boolean =>
  a.field === b.field &&
  a.condition === b.condition &&
  a.value === b.value &&
  sameJson(extraPart(a), extraPart(b))

/**
 * Whether two rule lists say the same, in the same order. `field`,
 * `condition` and `value` are compared, and so are the extra properties of a
 * rule, by value and whatever their key order (C-60).
 */
export const sameRules = (
  a: readonly FilterRule[],
  b: readonly FilterRule[]
): boolean =>
  a.length === b.length && a.every((rule, i) => sameRule(rule, b[i]))

const unknownPart = (query: Query): Record<string, unknown> =>
  Object.fromEntries(Object.entries(query).filter(([key]) => !known.has(key)))

const sameCursor = (a: Query, b: Query): boolean => {
  if (isCursorQuery(a) !== isCursorQuery(b)) {
    return false
  }
  if (isCursorQuery(a) && isCursorQuery(b)) {
    return sameJson(a.cursor, b.cursor)
  }
  return (a as PageQuery).page === (b as PageQuery).page
}

/**
 * Deep equality of two queries: the paging position, the page size, the
 * sort, the rules (`sameRules`), the search (absent equals `''`) and every
 * key the protocol does not know.
 */
export const sameQuery = (a: Query, b: Query): boolean =>
  sameCursor(a, b) &&
  a.pageSize === b.pageSize &&
  sameSort(a.sort, b.sort) &&
  sameRules(a.filters, b.filters) &&
  searchOf(a) === searchOf(b) &&
  sameJson(unknownPart(a), unknownPart(b))

const cloneValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)])
    )
  }
  return value
}

/**
 * A deep copy that shares no object with the original. Nothing is dropped:
 * keys the protocol does not know, and properties of a rule besides `field`,
 * `condition` and `value`, are copied as they are.
 */
export const cloneQuery = <Q extends Query>(query: Q): Q =>
  cloneValue(query) as Q

/** The rules of `field`, in their order. */
export const rulesOf = (
  filters: readonly FilterRule[],
  field: string
): FilterRule[] => filters.filter(rule => rule.field === field)

/**
 * `filters` with the rules of `field` replaced by `rules`. The new rules take
 * the place of the first old one; rules of other fields keep their order, and
 * a field that had no rule gets its rules at the end.
 */
export const replaceRules = (
  filters: readonly FilterRule[],
  field: string,
  rules: readonly FilterRule[]
): FilterRule[] => {
  const at = filters.findIndex(rule => rule.field === field)
  const others = filters.filter(rule => rule.field !== field)
  if (at < 0) {
    return [...others, ...rules]
  }
  const before = filters.slice(0, at).filter(rule => rule.field !== field)
  return [...before, ...rules, ...others.slice(before.length)]
}

/**
 * The query with `search` set. Text is kept as given (spaces included); `''`
 * removes the key, so an emitted query never carries an empty search.
 */
export const withSearch = <Q extends Query>(query: Q, search: string): Q => {
  const next = { ...query }
  if (search === '') {
    delete next.search
  } else {
    next.search = search
  }
  return next
}
