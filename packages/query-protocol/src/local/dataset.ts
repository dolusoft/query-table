// The dataset: what can be asked of a set of rows, independent of how
// columns look. defineDataset checks a definition, freezes a copy and brands
// it; applyQuery accepts only a branded copy (semantics.md#errors, step 1).

import { parseOffset } from './temporal'
import { columnTypes } from '../protocol/constants'
import type { ColumnType } from '../protocol/types'

/** One queryable field. JSON except `get`. */
export interface DatasetField<T = unknown> {
  /** The type of the values; nothing is converted to it. */
  type: ColumnType
  /**
   * Reads the raw value. Must be synchronous, deterministic and free of side
   * effects; it is called at most once per row and evaluation. A throw is
   * reported as `invalid-data`. Defaults to the dotted path of the field
   * name, read the way the table reads a cell (C-30).
   */
  get?: (row: T) => unknown
  /** Part of the global search. `string` fields only. Defaults to `false`. */
  search?: boolean
  /** Defaults to `true`. `false` makes a sort on it `unsupported-field`. */
  sortable?: boolean
  /** Defaults to `true`. `false` makes a rule on it `unsupported-field`. */
  filterable?: boolean
  /**
   * `datetime` only: a fixed UTC offset (`'+03:00'`), not a time zone.
   * Day-only and offset-less rule values, and offset-less row values, are
   * read in it. An explicit offset is never reinterpreted.
   */
  offset?: string
}

/**
 * What can be asked of a set of rows, independent of how columns look. A
 * hidden column's field may be here; a column that only formats need not be.
 */
export interface Dataset<T = unknown> {
  /** Field whose value identifies a row: unique, `string` or `integer`. Breaks sort ties. */
  readonly key: string
  /** The queryable fields by name. Their order means nothing. */
  readonly fields: Readonly<Record<string, DatasetField<T>>>
}

// The brand is a module-local registry, never part of the JSON.
const brand = new WeakSet<object>()
// Field offsets in minutes, parsed once per definition.
const offsets = new WeakMap<object, ReadonlyMap<string, number>>()

const hasOwn = (target: object, name: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, name)

/**
 * An object literal or an object without a prototype; an array, a `Map`, a
 * `Date` or a class instance is not. A Vue `reactive()` proxy of a plain
 * object is plain too (its prototype is read through the proxy).
 */
export const isPlainObject = (
  value: unknown
): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const optionalBoolean = (value: unknown): boolean =>
  value === undefined || typeof value === 'boolean'

const invalid = (message: string): TypeError =>
  new TypeError('defineDataset: ' + message)

/**
 * Checks a definition, copies and freezes the copy, and brands it. Only a
 * branded dataset is accepted by `applyQuery`. Throws `TypeError` on a
 * malformed definition (a programming error).
 */
export function defineDataset<T>(definition: Dataset<T>): Dataset<T> {
  if (typeof definition !== 'object' || definition === null) {
    throw invalid('the definition is not an object')
  }
  const { key, fields } = definition as { key: unknown; fields: unknown }
  if (!isPlainObject(fields)) {
    throw invalid('`fields` is not a plain object')
  }
  const names = Object.keys(fields)
  const copy: Record<string, DatasetField<T>> = {}
  const minutes = new Map<string, number>()
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    const field = fields[name] as Partial<Record<keyof DatasetField, unknown>>
    if (typeof field !== 'object' || field === null || Array.isArray(field)) {
      throw invalid(`field "${name}" is not an object`)
    }
    if (!(columnTypes as readonly unknown[]).includes(field.type)) {
      throw invalid(`field "${name}" has an unknown type`)
    }
    if (field.get !== undefined && typeof field.get !== 'function') {
      throw invalid(`field "${name}": \`get\` is not a function`)
    }
    if (
      !optionalBoolean(field.search) ||
      !optionalBoolean(field.sortable) ||
      !optionalBoolean(field.filterable)
    ) {
      throw invalid(
        `field "${name}": \`search\`, \`sortable\` and \`filterable\` are booleans`
      )
    }
    if (field.search === true && field.type !== 'string') {
      throw invalid(`field "${name}": only a string field is searched`)
    }
    if (field.offset !== undefined) {
      if (field.type !== 'datetime') {
        throw invalid(`field "${name}": only a datetime field has an offset`)
      }
      const offset =
        typeof field.offset === 'string' ? parseOffset(field.offset) : null
      if (offset === null) {
        throw invalid(`field "${name}": the offset is not +HH:MM, -HH:MM or Z`)
      }
      minutes.set(name, offset)
    }
    // defineProperty: a field named `__proto__` stays a field.
    Object.defineProperty(copy, name, {
      value: Object.freeze({ ...(field as DatasetField<T>) }),
      enumerable: true
    })
  }
  if (typeof key !== 'string' || !hasOwn(copy, key)) {
    throw invalid('`key` is not a field')
  }
  const keyType = copy[key].type
  if (keyType !== 'string' && keyType !== 'integer') {
    throw invalid('the key field is not string or integer')
  }
  const dataset: Dataset<T> = Object.freeze({
    key,
    fields: Object.freeze(copy)
  })
  brand.add(dataset)
  offsets.set(dataset, minutes)
  return dataset
}

/** True for a dataset made by defineDataset. */
export const isBranded = (value: unknown): value is Dataset<unknown> =>
  typeof value === 'object' && value !== null && brand.has(value)

/** The field of that name, own properties only (`toString` is not a field). */
export const fieldOf = (
  dataset: Dataset<never>,
  name: string
): DatasetField<never> | undefined =>
  hasOwn(dataset.fields, name) ? dataset.fields[name] : undefined

/** The offset of a datetime field in minutes, or null when it has none. */
export const offsetOf = (
  dataset: Dataset<never>,
  name: string
): number | null => offsets.get(dataset)?.get(name) ?? null
