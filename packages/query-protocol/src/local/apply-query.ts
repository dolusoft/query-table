// applyQuery and slicePage: validate, read the used row values, filter and
// search, count, sort, slice (C-76, C-77, C-80). Inputs are never written; the rows returned are the
// objects given, always in a new array.

import type { Dataset, DatasetField } from './dataset'
import { isBranded, offsetOf } from './dataset'
import type { Failure, LocalQueryResult } from './errors'
import { fail } from './errors'
import type { SemanticsProfile } from './profiles'
import { parseDate, parseDateTime } from './temporal'
import type { SortKey } from './text'
import {
  compareOrdinal,
  compareSortKeys,
  isWellFormed,
  matchKey,
  sortKey
} from './text'
import type { Plan, PlanRule } from './validate'
import { checkPage, validate } from './validate'
import type { PageQuery, Query } from '../protocol/types'

/** How applyQuery evaluates a query. */
export interface ApplyQueryOptions {
  /** Required: the meaning the query is evaluated with. */
  profile: SemanticsProfile
  /** `false` returns every matching row in order; `page` and `pageSize` are still validated. Defaults to `true`. */
  paginate?: boolean
}

// A value that does not fit its field type.
const invalidValue: unique symbol = Symbol('invalid')

/** A row with the values read from it, in the order of `plan.used`. */
interface Read<T> {
  readonly row: T
  readonly values: readonly unknown[]
}

/**
 * Reads a dotted path the way the table reads a cell (C-30): each step is a
 * case-sensitive property read, inherited properties included; a null or
 * missing step ends in null. A row that is not an object has no fields.
 */
const readPath = (row: unknown, name: string): unknown => {
  if (typeof row !== 'object' || row === null) {
    return null
  }
  const steps = name.split('.')
  let value: unknown = row
  for (let i = 0; i < steps.length; i++) {
    if (value === null || value === undefined) {
      return null
    }
    value = (value as Record<string, unknown>)[steps[i]]
  }
  return value ?? null
}

/** The comparable form of a data value (semantics.md#types), or invalidValue. */
const checkValue = (
  field: DatasetField<never>,
  raw: unknown,
  offset: number | null
): unknown => {
  if (raw === null) {
    return null
  }
  switch (field.type) {
    case 'string':
      return typeof raw === 'string' && isWellFormed(raw) ? raw : invalidValue
    case 'number':
      return typeof raw === 'number' && Number.isFinite(raw)
        ? raw
        : invalidValue
    case 'integer':
      return Number.isSafeInteger(raw) ? raw : invalidValue
    case 'bool':
      return typeof raw === 'boolean' ? raw : invalidValue
    case 'date':
      return parseDate(raw) ?? invalidValue
    case 'datetime': {
      const read = parseDateTime(raw, offset)
      return read.ok ? read.ms : invalidValue
    }
  }
}

/** Step 10: every row, the used fields in order, each read once. */
const readRows = <T>(
  allRows: readonly T[],
  dataset: Dataset<T>,
  plan: Plan
): { ok: true; rows: Read<T>[] } | Failure => {
  const fields = plan.used.map(name => dataset.fields[name])
  const offsets = plan.used.map(name => offsetOf(dataset, name))
  const keyAt = plan.used.indexOf(dataset.key)
  const seen = new Set<unknown>()
  const rows: Read<T>[] = []
  for (let row = 0; row < allRows.length; row++) {
    const item = allRows[row]
    const values: unknown[] = []
    for (let j = 0; j < fields.length; j++) {
      const field = plan.used[j]
      const definition = fields[j]
      let raw: unknown
      // A read error is a data error (step 10): a throwing `get`, and a
      // throwing getter or proxy trap met by a path read.
      try {
        raw = definition.get
          ? (definition.get(item) ?? null)
          : readPath(item, field)
      } catch {
        return fail(
          'invalid-data',
          { field, row },
          `Reading ${field} threw on row ${String(row)}.`
        )
      }
      const value = checkValue(definition, raw, offsets[j])
      if (value === invalidValue) {
        return fail(
          'invalid-data',
          { field, row },
          `The value of ${field} on row ${String(row)} does not fit its type.`
        )
      }
      values.push(value)
    }
    const key = values[keyAt]
    if (key === null) {
      return fail(
        'invalid-data',
        { field: dataset.key, row },
        `Row ${String(row)} has no key.`
      )
    }
    if (seen.has(key)) {
      return fail(
        'duplicate-key',
        { field: dataset.key, row },
        `The key of row ${String(row)} was seen before.`
      )
    }
    seen.add(key)
    rows.push({ row: item, values })
  }
  return { ok: true, rows }
}

/**
 * Whether the positive condition of `rule` holds on a value read from a row
 * (semantics.md#conditions): never on null. A text value is its match fold,
 * compared ordinally; a day is a half-open range; a number, a boolean and an
 * instant compare as they are (`-0` equals `0`).
 */
const holds = (rule: PlanRule, value: unknown): boolean => {
  if (value === null) {
    return false
  }
  const operand = rule.operand
  if (operand.kind === 'text') {
    const text = value as string
    switch (rule.positive) {
      case 'Contains':
        return text.includes(operand.text)
      case 'StartsWith':
        return text.startsWith(operand.text)
      case 'EndsWith':
        return text.endsWith(operand.text)
      default:
        // Equal: the matrix allows nothing else on text.
        return text === operand.text
    }
  }
  const t = value as number
  if (operand.kind === 'range') {
    switch (rule.positive) {
      case 'Equal':
        return t >= operand.start && t < operand.end
      case 'GreaterThan':
        return t >= operand.end
      case 'GreaterThanOrEqual':
        return t >= operand.start
      case 'LessThan':
        return t < operand.start
      default:
        // LessThanOrEqual: the matrix allows nothing else on a day.
        return t < operand.end
    }
  }
  const v = operand.value as number
  switch (rule.positive) {
    case 'GreaterThan':
      return t > v
    case 'GreaterThanOrEqual':
      return t >= v
    case 'LessThan':
      return t < v
    case 'LessThanOrEqual':
      return t <= v
    default:
      // Equal, also on a boolean.
      return value === operand.value
  }
}

/**
 * Filters and searches (C-17, C-80): every rule group holds (a group of
 * negative rules with AND, any other with OR) and, with an active search,
 * one search field contains the needle. The match fold of a text value is
 * computed at most once per row and evaluation.
 */
const matchRows = <T>(rows: Read<T>[], plan: Plan): Read<T>[] => {
  const groups = plan.groups
  const search = plan.search
  if (groups.length === 0 && search === null) {
    return rows
  }
  // One slot per used field, reset per row: a packed array, not a holey one.
  const folded = new Array<string | null | undefined>(plan.used.length).fill(
    undefined
  )
  const fold = (values: readonly unknown[], at: number): string | null => {
    let text = folded[at]
    if (text === undefined) {
      const value = values[at]
      text = value === null ? null : matchKey(value as string)
      folded[at] = text
    }
    return text
  }
  const out: Read<T>[] = []
  for (let r = 0; r < rows.length; r++) {
    const values = rows[r].values
    folded.fill(undefined)
    let ok = true
    for (let g = 0; ok && g < groups.length; g++) {
      const group = groups[g]
      const value = group.text ? fold(values, group.at) : values[group.at]
      // AND starts true and stops at a false rule; OR the other way round.
      ok = group.every
      for (let i = 0; i < group.rules.length; i++) {
        const rule = group.rules[i]
        const result = rule.negative !== holds(rule, value)
        if (result !== group.every) {
          ok = !group.every
          break
        }
      }
    }
    if (ok && search !== null) {
      ok = false
      for (let i = 0; !ok && i < search.at.length; i++) {
        const text = fold(values, search.at[i])
        ok = text !== null && text.includes(search.needle)
      }
    }
    if (ok) {
      out.push(rows[r])
    }
  }
  return out
}

const compareNumbers = (a: number, b: number): number =>
  a < b ? -1 : a > b ? 1 : 0

/**
 * Orders by the sort field (null smallest; `desc` reverses the whole value
 * comparison), then by key ascending in both directions: `integer`
 * numerically, `string` by the ordinal order of the raw value. Text values
 * are decorated once per row.
 */
const sortRows = <T>(
  list: readonly Read<T>[],
  dataset: Dataset<T>,
  plan: Plan
): Read<T>[] => {
  const sort = plan.sort
  if (!sort) {
    return list.slice()
  }
  const at = plan.used.indexOf(sort.field)
  const keyAt = plan.used.indexOf(dataset.key)
  const text = dataset.fields[sort.field].type === 'string'
  const stringKey = dataset.fields[dataset.key].type === 'string'
  const direction = sort.desc ? -1 : 1
  const decorated = list.map(read => {
    const value = read.values[at]
    return {
      read,
      value:
        value === null
          ? null
          : text
            ? sortKey(value as string)
            : typeof value === 'boolean'
              ? Number(value)
              : (value as number),
      key: read.values[keyAt] as string | number
    }
  })
  decorated.sort((a, b) => {
    let order: number
    if (a.value === null || b.value === null) {
      order = a.value === b.value ? 0 : a.value === null ? -1 : 1
    } else if (text) {
      order = compareSortKeys(a.value as SortKey, b.value as SortKey)
    } else {
      order = compareNumbers(a.value as number, b.value as number)
    }
    if (order !== 0) {
      return order * direction
    }
    return stringKey
      ? compareOrdinal(a.key as string, b.key as string)
      : compareNumbers(a.key as number, b.key as number)
  })
  return decorated.map(item => item.read)
}

/** The page `[(page - 1) * pageSize, page * pageSize)`, without overflow. */
const pageOf = <T>(list: readonly T[], page: number, pageSize: number): T[] => {
  const pages = Math.ceil(list.length / pageSize)
  if (page - 1 >= pages) {
    return []
  }
  return list.slice((page - 1) * pageSize, page * pageSize)
}

const checkRows = (rows: unknown, name: string): void => {
  if (!Array.isArray(rows)) {
    throw new TypeError(`${name}: the rows are not an array`)
  }
}

/**
 * Evaluates `query` over `allRows` with `profile`: validate the query,
 * validate the used row values, filter and search, count, sort, slice.
 * Inputs are never written; the rows returned are the objects given. Query,
 * data and getter problems are returned as the first error in the order of
 * the profile; it throws `TypeError` only when its own preconditions are
 * broken (a dataset not made by `defineDataset`, malformed options).
 */
export function applyQuery<T>(
  allRows: readonly T[],
  query: Query,
  dataset: Dataset<T>,
  options: ApplyQueryOptions
): LocalQueryResult<T> {
  // 1. Preconditions.
  checkRows(allRows, 'applyQuery')
  if (!isBranded(dataset)) {
    throw new TypeError('applyQuery: the dataset was not made by defineDataset')
  }
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('applyQuery: options is not an object')
  }
  const paginate: unknown = options.paginate
  if (paginate !== undefined && typeof paginate !== 'boolean') {
    throw new TypeError('applyQuery: options.paginate is not a boolean')
  }
  // 2 to 9.
  const checked = validate(query, dataset, options.profile)
  if (!checked.ok) {
    return checked
  }
  const plan = checked.plan
  // 10.
  const read = readRows(allRows, dataset, plan)
  if (!read.ok) {
    return read
  }
  const matching = matchRows(read.rows, plan)
  const totalRows = matching.length
  const ordered = sortRows(matching, dataset, plan)
  const page =
    paginate === false
      ? ordered
      : pageOf(ordered, (query as PageQuery).page, query.pageSize)
  return { ok: true, rows: page.map(item => item.row), totalRows }
}

/**
 * One page of rows that are already in order: validates the paging part of
 * `query` exactly as `applyQuery` does (`invalid-query`,
 * `cursor-not-supported`, `invalid-page`) and slices. `totalRows` is
 * `rows.length`.
 */
export function slicePage<T>(
  rows: readonly T[],
  query: Pick<PageQuery, 'page' | 'pageSize'> | Query
): LocalQueryResult<T> {
  checkRows(rows, 'slicePage')
  const paging = checkPage(query)
  if (paging) {
    return paging
  }
  const { page, pageSize } = query as Pick<PageQuery, 'page' | 'pageSize'>
  return {
    ok: true,
    rows: pageOf(rows, page, pageSize),
    totalRows: rows.length
  }
}
