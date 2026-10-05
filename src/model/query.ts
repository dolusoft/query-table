import type {
  Column,
  ColumnType,
  FilterRule,
  SortDirection,
  SortState,
  TableQuery
} from '../contract'

const columnTypes: readonly ColumnType[] = [
  'string',
  'number',
  'integer',
  'date',
  'datetime',
  'bool'
]

/** Column type, lower-cased; anything unknown reads as `'string'`. */
export const columnTypeOf = (column: Column): ColumnType => {
  const type = column.type?.toLowerCase() as ColumnType | undefined
  return type && columnTypes.includes(type) ? type : 'string'
}

/** Reads a dotted path (`'a.b'`) from a row. */
export const valueAt = (row: object, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value === null || value === undefined
          ? undefined
          : (value as Record<string, unknown>)[key],
      row
    )

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

/** Header click: ascending first, then flipping between the two. */
export const nextDirection = (
  sort: SortState | null,
  field: string
): SortDirection =>
  sort?.field === field && sort.direction === 'asc' ? 'desc' : 'asc'
