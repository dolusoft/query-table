import type { FilterRule, SortState, TableQuery } from '../contract'

const sameRule = (a: FilterRule, b: FilterRule): boolean =>
  a.field === b.field && a.condition === b.condition && a.value === b.value

export const sameRules = (
  a: readonly FilterRule[],
  b: readonly FilterRule[]
): boolean =>
  a.length === b.length && a.every((rule, i) => sameRule(rule, b[i]))

const sameSort = (a: SortState | null, b: SortState | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.field === b.field &&
    a.direction === b.direction)

/** Deep equality of two queries. */
export const sameQuery = (a: TableQuery, b: TableQuery): boolean =>
  a.page === b.page &&
  a.pageSize === b.pageSize &&
  sameSort(a.sort, b.sort) &&
  sameRules(a.filters, b.filters)

/** A copy that shares no object with the original. */
export const cloneQuery = (query: TableQuery): TableQuery => ({
  page: query.page,
  pageSize: query.pageSize,
  sort: query.sort ? { ...query.sort } : null,
  filters: query.filters.map(rule => ({ ...rule }))
})

export const rulesOf = (
  filters: readonly FilterRule[],
  field: string
): FilterRule[] => filters.filter(rule => rule.field === field)

/**
 * `filters` with the rules of `field` replaced by `rules`. The new rules take
 * the place of the first old one; rules of other fields keep their order.
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
