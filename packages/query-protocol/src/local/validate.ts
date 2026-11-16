// Validation of a query before any row is read (semantics.md#validation-order,
// steps 2 to 9). Query errors are found without looking at the rows, so an
// empty data set never hides a malformed query.

import type { Dataset, DatasetField } from './dataset'
import { fieldOf, isPlainObject, offsetOf } from './dataset'
import type { Failure } from './errors'
import { fail } from './errors'
import type { SemanticsProfile } from './profiles'
import { profiles, reservedQueryKeys } from './profiles'
import { parseDate, parseDateTimeRule } from './temporal'
import { compareOrdinal, isWellFormed, matchKey, trimSearch } from './text'
import { noValueConditions, rangeConditions } from '../protocol/constants'
import type { ColumnType } from '../protocol/types'

/**
 * A condition that holds on a value; a negative one is its complement.
 * `IsNull`, `IsNotNull` and `Between` (tr-2) are positive: none of them is
 * the complement of another, so none joins a group of negative rules (C-17).
 */
type Positive =
  | 'Contains'
  | 'StartsWith'
  | 'EndsWith'
  | 'Equal'
  | 'GreaterThan'
  | 'GreaterThanOrEqual'
  | 'LessThan'
  | 'LessThanOrEqual'
  | 'IsNull'
  | 'IsNotNull'
  | 'Between'

const textTypes: readonly ColumnType[] = ['string']
const anyType: readonly ColumnType[] = [
  'string',
  'number',
  'integer',
  'bool',
  'date',
  'datetime'
]
const orderedTypes: readonly ColumnType[] = [
  'number',
  'integer',
  'date',
  'datetime'
]

type Matrix = ReadonlyMap<
  string,
  { readonly types: readonly ColumnType[]; readonly positive: Positive }
>

/**
 * The condition x type matrix of tr-1 (semantics.md#condition-by-type): the
 * types a condition is allowed on, and the positive condition it is
 * evaluated as. A Map, so a condition named like an Object.prototype member
 * is unknown.
 */
const matrix1: Matrix = /* @__PURE__ */ new Map([
  ['Contains', { types: textTypes, positive: 'Contains' }],
  ['NotContains', { types: textTypes, positive: 'Contains' }],
  ['StartsWith', { types: textTypes, positive: 'StartsWith' }],
  ['EndsWith', { types: textTypes, positive: 'EndsWith' }],
  ['Equal', { types: anyType, positive: 'Equal' }],
  ['NotEqual', { types: anyType, positive: 'Equal' }],
  ['GreaterThan', { types: orderedTypes, positive: 'GreaterThan' }],
  [
    'GreaterThanOrEqual',
    { types: orderedTypes, positive: 'GreaterThanOrEqual' }
  ],
  ['LessThan', { types: orderedTypes, positive: 'LessThan' }],
  ['LessThanOrEqual', { types: orderedTypes, positive: 'LessThanOrEqual' }]
])

/** The matrix of tr-2: tr-1 and the three conditions of ADR 0020. */
const matrix2: Matrix = /* @__PURE__ */ new Map(matrix1)
  .set('IsNull', { types: anyType, positive: 'IsNull' })
  .set('IsNotNull', { types: anyType, positive: 'IsNotNull' })
  .set('Between', { types: orderedTypes, positive: 'Between' })

/** What a profile changes in the validation of a rule. */
interface ProfileRules {
  readonly matrix: Matrix
  /** Conditions refused as extensions (R4): tr-1 reserves the null predicates. */
  readonly reserved: readonly unknown[]
  /**
   * Whether the condition decides how many values the rule has (tr-2). In
   * tr-1 every rule has one `value`.
   */
  readonly arity: boolean
}

const profileRules: Readonly<Record<SemanticsProfile, ProfileRules>> = {
  'tr-1': { matrix: matrix1, reserved: noValueConditions, arity: false },
  'tr-2': { matrix: matrix2, reserved: [], arity: true }
}

/** How many values a rule of `condition` has in tr-2. */
const arityOf = (condition: string): 0 | 1 | 2 =>
  (noValueConditions as readonly string[]).includes(condition)
    ? 0
    : (rangeConditions as readonly string[]).includes(condition)
      ? 2
      : 1

const isValue = (value: unknown): boolean => {
  const type = typeof value
  return type === 'string' || type === 'number' || type === 'boolean'
}

/**
 * The value a rule compares with, computed once per evaluation: the match
 * fold of a text, a number, a boolean or an instant, or the half-open range
 * `[start, end)` of a day (day numbers on a `date` field, milliseconds on a
 * `datetime` field).
 */
type Operand =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'value'; readonly value: number | boolean }
  | { readonly kind: 'range'; readonly start: number; readonly end: number }

/** One rule, ready to test a value read from a row. */
export interface PlanRule {
  readonly positive: Positive
  /** `NotEqual` and `NotContains`: the exact complement, true on null. */
  readonly negative: boolean
  /** `null` for `IsNull` and `IsNotNull`; the lower bound of `Between`. */
  readonly operand: Operand | null
  /** The upper bound of `Between`; `null` for every other condition. */
  readonly operand2: Operand | null
}

export type { Operand, Positive }

/** The rules of one field (C-17): AND when all are negative, else OR. */
interface PlanGroup {
  /** Index of the field in `Plan.used`. */
  readonly at: number
  /** A `string` field: its value is compared by its match fold. */
  readonly text: boolean
  /** Every rule is negative, so every rule must hold. */
  readonly every: boolean
  readonly rules: readonly PlanRule[]
}

/** What a valid query asks of the rows. */
export interface Plan {
  readonly sort: { readonly field: string; readonly desc: boolean } | null
  /**
   * The fields read from every row, in the order their errors are reported
   * (step 10): `sort.field`, the rule fields, the search fields, the key;
   * each once.
   */
  readonly used: readonly string[]
  /** The rule groups; every group must hold. */
  readonly groups: readonly PlanGroup[]
  /**
   * An active search: the needle `M(C(trimmed))` and the indexes in `used`
   * of the search fields, in ordinal name order. `null` when the search is
   * absent, null or blank.
   */
  readonly search: {
    readonly needle: string
    readonly at: readonly number[]
  } | null
}

type Checked = { ok: true; plan: Plan } | Failure

const hasOwn = (target: object, name: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, name)

const isPage = (value: unknown): boolean =>
  Number.isSafeInteger(value) && (value as number) >= 1

const isName = (value: unknown): value is string =>
  typeof value === 'string' && value !== ''

/** Steps 3 to 5: the query is an object, has no cursor, names a valid page. */
export const checkPage = (query: unknown): Failure | null => {
  if (!isPlainObject(query)) {
    return fail(
      'invalid-query',
      { path: '' },
      'The query is not a plain object.'
    )
  }
  if (hasOwn(query, 'cursor')) {
    return fail(
      'cursor-not-supported',
      { path: '/cursor' },
      'Only page mode is evaluated; the query has a cursor key.'
    )
  }
  if (!isPage(query.page)) {
    return fail(
      'invalid-page',
      { path: '/page' },
      'page is not a safe integer of at least 1.'
    )
  }
  if (!isPage(query.pageSize)) {
    return fail(
      'invalid-page',
      { path: '/pageSize' },
      'pageSize is not a safe integer of at least 1.'
    )
  }
  return null
}

/** Steps 2 to 9, in order; the first error wins. */
export const validate = (
  query: unknown,
  dataset: Dataset<never>,
  profile: unknown
): Checked => {
  // 2. Profile.
  if (!(profiles as readonly unknown[]).includes(profile)) {
    return fail(
      'unknown-profile',
      {},
      `This build does not implement the profile ${String(profile)}.`
    )
  }
  // 3 to 5. Shape, cursor, page.
  const paging = checkPage(query)
  if (paging) {
    return paging
  }
  const q = query as Record<string, unknown>
  // 6. Reserved keys, in their order.
  for (let i = 0; i < reservedQueryKeys.length; i++) {
    const name = reservedQueryKeys[i]
    if (hasOwn(q, name)) {
      return fail(
        'unsupported-extension',
        { name, path: '/' + name },
        `The key ${name} is reserved and not evaluated.`
      )
    }
  }
  // 7. Sort.
  if (!hasOwn(q, 'sort')) {
    return fail(
      'invalid-query',
      { path: '/sort' },
      'The query has no sort key.'
    )
  }
  let sort: Plan['sort'] = null
  if (q.sort !== null) {
    if (!isPlainObject(q.sort)) {
      return fail(
        'invalid-query',
        { path: '/sort' },
        'sort is not a plain object or null.'
      )
    }
    const { field, direction } = q.sort
    if (!isName(field)) {
      return fail(
        'invalid-query',
        { path: '/sort/field' },
        'sort.field is not a non-empty string.'
      )
    }
    const definition = fieldOf(dataset, field)
    if (!definition) {
      return fail(
        'unknown-field',
        { field, path: '/sort/field' },
        `The dataset has no field ${field}.`
      )
    }
    if (definition.sortable === false) {
      return fail(
        'unsupported-field',
        { field, path: '/sort/field' },
        `The field ${field} is not sortable.`
      )
    }
    if (direction !== 'asc' && direction !== 'desc') {
      return fail(
        'invalid-query',
        { path: '/sort/direction' },
        'sort.direction is not asc or desc.'
      )
    }
    sort = { field, desc: direction === 'desc' }
  }
  // 8. Rules.
  if (!Array.isArray(q.filters)) {
    return fail(
      'invalid-query',
      { path: '/filters' },
      'filters is not an array.'
    )
  }
  const filters: readonly unknown[] = q.filters
  const meaning = profileRules[profile as SemanticsProfile]
  const rules: { field: string; text: boolean; rule: PlanRule }[] = []
  for (let rule = 0; rule < filters.length; rule++) {
    const path = '/filters/' + String(rule)
    const item = filters[rule]
    if (!isPlainObject(item)) {
      return fail(
        'invalid-query',
        { rule, path },
        'The rule is not a plain object.'
      )
    }
    if (!isName(item.field)) {
      return fail(
        'invalid-query',
        { rule, path: path + '/field' },
        'The rule field is not a non-empty string.'
      )
    }
    if (typeof item.condition !== 'string') {
      return fail(
        'invalid-query',
        { rule, path: path + '/condition' },
        'The rule condition is not a string.'
      )
    }
    // The operands' shape, where tr-1 checks its one value: in tr-2 the
    // condition says how many there are (none, one, or two for Between).
    const arity = meaning.arity ? arityOf(item.condition) : 1
    if (arity === 0) {
      if (item.value !== undefined) {
        return fail(
          'invalid-query',
          { rule, path: path + '/value' },
          `A rule of ${item.condition} has no value.`
        )
      }
      if (item.value2 !== undefined) {
        return fail(
          'invalid-query',
          { rule, path: path + '/value2' },
          `A rule of ${item.condition} has no value2.`
        )
      }
    } else if (!hasOwn(item, 'value') || !isValue(item.value)) {
      return fail(
        'invalid-query',
        { rule, path: path + '/value' },
        'The rule value is not a string, number or boolean.'
      )
    } else if (
      arity === 2 &&
      (!hasOwn(item, 'value2') || !isValue(item.value2))
    ) {
      return fail(
        'invalid-query',
        { rule, path: path + '/value2' },
        'The upper bound value2 is not a string, number or boolean.'
      )
    }
    const field = item.field
    const definition = fieldOf(dataset, field)
    if (!definition) {
      return fail(
        'unknown-field',
        { field, rule, path: path + '/field' },
        `The dataset has no field ${field}.`
      )
    }
    if (definition.filterable === false) {
      return fail(
        'unsupported-field',
        { field, rule, path: path + '/field' },
        `The field ${field} is not filterable.`
      )
    }
    if (meaning.reserved.includes(item.condition)) {
      return fail(
        'unsupported-extension',
        { name: item.condition, field, rule, path: path + '/condition' },
        `The condition ${item.condition} is reserved and not evaluated.`
      )
    }
    const allowed = meaning.matrix.get(item.condition)
    if (!allowed || !allowed.types.includes(definition.type)) {
      return fail(
        'unsupported-operator',
        { field, rule, path: path + '/condition' },
        `The condition ${item.condition} is not allowed on the ${definition.type} field ${field}.`
      )
    }
    const offset = offsetOf(dataset, field)
    let operand: Operand | null = null
    let operand2: Operand | null = null
    if (arity > 0) {
      operand = operandOf(definition, item.value, offset)
      if (!operand) {
        return fail(
          'invalid-value',
          { field, rule, path: path + '/value' },
          `The rule value does not fit the ${definition.type} field ${field}.`
        )
      }
    }
    if (arity === 2) {
      operand2 = operandOf(definition, item.value2, offset)
      if (!operand2) {
        return fail(
          'invalid-value',
          { field, rule, path: path + '/value2' },
          `The upper bound does not fit the ${definition.type} field ${field}.`
        )
      }
    }
    rules.push({
      field,
      text: definition.type === 'string',
      rule: {
        positive: allowed.positive,
        negative: allowed.positive !== item.condition,
        operand,
        operand2
      }
    })
  }
  // 9. Search: trimmed of the listed units only, then composed and folded.
  let needle = ''
  const search = q.search
  if (search !== undefined && search !== null) {
    if (typeof search !== 'string') {
      return fail(
        'invalid-query',
        { path: '/search' },
        'search is not a string.'
      )
    }
    if (!isWellFormed(search)) {
      return fail(
        'invalid-value',
        { path: '/search' },
        'search has an unpaired surrogate.'
      )
    }
    needle = matchKey(trimSearch(search))
  }
  // A blank search is no search, also on a dataset without search fields.
  const searchFields: string[] = []
  if (needle !== '') {
    const names = Object.keys(dataset.fields)
    for (let i = 0; i < names.length; i++) {
      if (dataset.fields[names[i]].search === true) {
        searchFields.push(names[i])
      }
    }
    if (searchFields.length === 0) {
      return fail(
        'search-not-supported',
        { path: '/search' },
        'The search is active but the dataset has no search field.'
      )
    }
    searchFields.sort(compareOrdinal)
  }
  // 10 (order only): sort field, rule fields in rule order, search fields
  // in ordinal name order, key; each once.
  const used: string[] = []
  const use = (name: string): number => {
    const at = used.indexOf(name)
    if (at >= 0) {
      return at
    }
    used.push(name)
    return used.length - 1
  }
  if (sort) {
    use(sort.field)
  }
  const groups: {
    at: number
    text: boolean
    every: boolean
    rules: PlanRule[]
  }[] = []
  for (let i = 0; i < rules.length; i++) {
    const at = use(rules[i].field)
    const rule = rules[i].rule
    let group = groups.find(item => item.at === at)
    if (!group) {
      group = { at, text: rules[i].text, every: true, rules: [] }
      groups.push(group)
    }
    group.rules.push(rule)
    group.every = group.every && rule.negative
  }
  const searchAt = searchFields.map(use)
  use(dataset.key)
  return {
    ok: true,
    plan: {
      sort,
      used,
      groups,
      search: needle === '' ? null : { needle, at: searchAt }
    }
  }
}

/**
 * The comparable form of a rule value (semantics.md#types), or null when it
 * does not fit the field (`invalid-value`). Nothing is converted, and a text
 * is not trimmed: a blank value is a value, an empty one is not.
 */
const operandOf = (
  definition: DatasetField<never>,
  value: unknown,
  offset: number | null
): Operand | null => {
  switch (definition.type) {
    case 'string':
      return typeof value === 'string' && value !== '' && isWellFormed(value)
        ? { kind: 'text', text: matchKey(value) }
        : null
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? { kind: 'value', value }
        : null
    case 'integer':
      return Number.isSafeInteger(value)
        ? { kind: 'value', value: value as number }
        : null
    case 'bool':
      return typeof value === 'boolean' ? { kind: 'value', value } : null
    case 'date': {
      const day = parseDate(value)
      return day === null ? null : { kind: 'range', start: day, end: day + 1 }
    }
    case 'datetime': {
      const read = parseDateTimeRule(value, offset)
      if (!read.ok) {
        return null
      }
      return read.kind === 'day'
        ? { kind: 'range', start: read.start, end: read.end }
        : { kind: 'value', value: read.ms }
    }
    case 'ip':
      // `defineDataset` refuses an ip field (C-118).
      return null
  }
}
