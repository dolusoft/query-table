// The closed vocabularies of the query, as values. This file imports nothing,
// so `scripts/gen-schema.mjs` can load it with Node's type stripping and build
// the JSON Schema from the same lists the types are made of.

/**
 * Every comparison a rule may carry. A column with no rule is not filtered,
 * so "no filter" is not a condition. The last three came with 3.13
 * (ADR 0020): `IsNull` and `IsNotNull` take no value, `Between` takes two
 * (`noValueConditions`, `rangeConditions`); every other one takes one.
 */
export const filterConditions = [
  'Contains',
  'NotContains',
  'Equal',
  'NotEqual',
  'StartsWith',
  'EndsWith',
  'GreaterThan',
  'GreaterThanOrEqual',
  'LessThan',
  'LessThanOrEqual',
  'IsNull',
  'IsNotNull',
  'Between'
] as const

/** The conditions whose rule has neither `value` nor `value2`. */
export const noValueConditions = ['IsNull', 'IsNotNull'] as const

/** The conditions whose rule has a lower `value` and an upper `value2`. */
export const rangeConditions = ['Between'] as const

/** The two directions of a sort. */
export const sortDirections = ['asc', 'desc'] as const

/**
 * What the user did to produce an update: a page step, a page size change, a
 * sort, a filter, clearing every filter, or a global search (K6).
 */
export const queryChangeReasons = [
  'page',
  'pageSize',
  'sort',
  'filter',
  'reset',
  'search'
] as const

/** The two directions of a cursor step (K6). */
export const cursorDirections = ['next', 'prev'] as const

/** Data types of a column; the type picks the grammar of its filter text. */
export const columnTypes = [
  'string',
  'number',
  'integer',
  'date',
  'datetime',
  'bool',
  'ip'
] as const
