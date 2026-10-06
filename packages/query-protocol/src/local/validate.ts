// Validation of a query before any row is read (semantics.md#validation-order,
// steps 2 to 9). Query errors are found without looking at the rows, so an
// empty data set never hides a malformed query.

import type { Dataset } from './dataset'
import { fieldOf } from './dataset'
import type { Failure } from './errors'
import { fail } from './errors'
import { profiles, reservedQueryKeys } from './profiles'
import { isWellFormed, trimSearch } from './text'

// Conditions reserved inside the evaluator, refused as extensions (R4).
const reservedConditions: readonly unknown[] = ['IsNull', 'IsNotNull']

/** What a valid query asks of the rows. */
export interface Plan {
  readonly sort: { readonly field: string; readonly desc: boolean } | null
  /**
   * The fields read from every row, in the order their errors are reported
   * (step 10): `sort.field`, the rule fields, the search fields, the key;
   * each once.
   */
  readonly used: readonly string[]
}

type Checked = { ok: true; plan: Plan } | Failure

const hasOwn = (target: object, name: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, name)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPage = (value: unknown): boolean =>
  Number.isSafeInteger(value) && (value as number) >= 1

const isName = (value: unknown): value is string =>
  typeof value === 'string' && value !== ''

/** Steps 3 to 5: the query is an object, has no cursor, names a valid page. */
export const checkPage = (query: unknown): Failure | null => {
  if (!isRecord(query)) {
    return fail('invalid-query', { path: '' }, 'The query is not an object.')
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
    if (!isRecord(q.sort)) {
      return fail(
        'invalid-query',
        { path: '/sort' },
        'sort is not an object or null.'
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
  for (let rule = 0; rule < filters.length; rule++) {
    const path = '/filters/' + String(rule)
    const item = filters[rule]
    if (!isRecord(item)) {
      return fail('invalid-query', { rule, path }, 'The rule is not an object.')
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
    const valueType = typeof item.value
    if (
      !hasOwn(item, 'value') ||
      (valueType !== 'string' &&
        valueType !== 'number' &&
        valueType !== 'boolean')
    ) {
      return fail(
        'invalid-query',
        { rule, path: path + '/value' },
        'The rule value is not a string, number or boolean.'
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
    if (reservedConditions.includes(item.condition)) {
      return fail(
        'unsupported-extension',
        { name: item.condition, field, rule, path: path + '/condition' },
        `The condition ${item.condition} is reserved and not evaluated.`
      )
    }
    // PR-L1 only: rules are refused until PR-L2 brings the condition x type
    // matrix (checkRule). Not released (no release between L1 and L2); L2
    // deletes this block and its tests.
    return fail(
      'unsupported-operator',
      { field, rule, path: path + '/condition' },
      'Rules are not evaluated yet.'
    )
  }
  // 9. Search.
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
    // PR-L1 only: an active search is refused until PR-L2; L2 replaces this
    // with "no search fields" and adds the search fields to `used`.
    if (trimSearch(search) !== '') {
      return fail(
        'search-not-supported',
        { path: '/search' },
        'Search is not evaluated yet.'
      )
    }
  }
  // 10 (order only). The key is always read last.
  const used: string[] = []
  if (sort) {
    used.push(sort.field)
  }
  if (!used.includes(dataset.key)) {
    used.push(dataset.key)
  }
  return { ok: true, plan: { sort, used } }
}
