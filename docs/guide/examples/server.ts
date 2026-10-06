import {
  type CursorQuery,
  type FilterRule,
  isCursorQuery,
  type PageCursors,
  type PageQuery,
  type Query
} from '@dolusoft/query-protocol'
import schema from '@dolusoft/query-protocol/query.schema.json' with { type: 'json' }
import Ajv2020 from 'ajv/dist/2020.js'

// #region rows
export interface Person {
  id: number
  name: string
  age: number
  joined: string
  active: boolean
}

export const people: Person[] = [
  { id: 1, name: 'Ali', age: 31, joined: '2021-03-01', active: true },
  { id: 2, name: 'Ayşe', age: 27, joined: '2022-07-15', active: true },
  { id: 3, name: 'Veli', age: 45, joined: '2019-11-30', active: false },
  { id: 4, name: 'Zeynep', age: 36, joined: '2023-01-09', active: true },
  { id: 5, name: 'Can', age: 22, joined: '2024-05-20', active: true },
  { id: 6, name: 'Elif', age: 29, joined: '2020-09-02', active: false }
]

/** Page mode: the rows of the page and the total of the whole result. */
export interface PageAnswer {
  rows: Person[]
  total: number
}

/** Cursor mode: the rows and the cursors of the page, no total needed. */
export interface CursorAnswer {
  rows: Person[]
  cursors: PageCursors
}
// #endregion rows

export class BadQuery extends Error {}

// #region validate
// The schema checks the shape. What it cannot know is yours to check: which
// fields exist, which condition a field takes, how large a page may be.
// `strict: false`: the schema uses union types and untyped `required`, which
// Ajv's strict mode only warns about.
const ajv = new Ajv2020({ strict: false })
const validateShape = ajv.compile(schema)

const fields = ['id', 'name', 'age', 'joined', 'active'] as const
type Field = (typeof fields)[number]
const isField = (name: string): name is Field =>
  (fields as readonly string[]).includes(name)
const maxPageSize = 100

export function parseQuery(body: unknown): Query {
  if (!validateShape(body)) {
    throw new BadQuery(ajv.errorsText(validateShape.errors))
  }
  const query = body as Query
  if (query.pageSize > maxPageSize) {
    throw new BadQuery(`pageSize is at most ${maxPageSize}`)
  }
  for (const name of [
    ...query.filters.map(rule => rule.field),
    ...(query.sort ? [query.sort.field] : [])
  ]) {
    if (!isField(name)) {
      throw new BadQuery(`unknown field: ${name}`)
    }
  }
  return query
}
// #endregion validate

type Cell = string | number | boolean

const lower = (value: Cell): Cell =>
  typeof value === 'string' ? value.toLowerCase() : value

const compare = (a: Cell, b: Cell): number => {
  const [left, right] = [lower(a), lower(b)]
  return left === right ? 0 : left < right ? -1 : 1
}

const holds = (row: Person, rule: FilterRule): boolean => {
  const cell = row[rule.field as Field]
  const text = String(cell).toLowerCase()
  const value = String(rule.value).toLowerCase()
  switch (rule.condition) {
    case 'Contains':
      return text.includes(value)
    case 'NotContains':
      return !text.includes(value)
    case 'StartsWith':
      return text.startsWith(value)
    case 'EndsWith':
      return text.endsWith(value)
    case 'Equal':
      return compare(cell, rule.value) === 0
    case 'NotEqual':
      return compare(cell, rule.value) !== 0
    case 'GreaterThan':
      return compare(cell, rule.value) > 0
    case 'GreaterThanOrEqual':
      return compare(cell, rule.value) >= 0
    case 'LessThan':
      return compare(cell, rule.value) < 0
    case 'LessThanOrEqual':
      return compare(cell, rule.value) <= 0
  }
}

const isNegative = (rule: FilterRule) =>
  rule.condition === 'NotEqual' || rule.condition === 'NotContains'

// #region combine
/**
 * Rules of one field combine with OR, or with AND when all of them are
 * negative; rules of different fields combine with AND.
 */
export const matches = (row: Person, filters: readonly FilterRule[]) =>
  [...new Set(filters.map(rule => rule.field))].every(field => {
    const rules = filters.filter(rule => rule.field === field)
    return rules.every(isNegative)
      ? rules.every(rule => holds(row, rule))
      : rules.some(rule => holds(row, rule))
  })
// #endregion combine

const select = (query: Query): Person[] => {
  const needle = query.search?.toLowerCase()
  const rows = people
    .filter(row => matches(row, query.filters))
    .filter(
      row =>
        needle === undefined ||
        [row.name, row.joined].some(text => text.toLowerCase().includes(needle))
    )
  const { sort } = query
  if (sort) {
    const sign = sort.direction === 'asc' ? 1 : -1
    const key = sort.field as Field
    rows.sort((a, b) => sign * compare(a[key], b[key]))
  }
  return rows
}

// Opaque to the table, and to the consumer: here a base64 row id.
const encode = (id: number) => btoa(String(id))
const decode = (token: string) => Number(atob(token))

// #region answer
export function answer(query: PageQuery): PageAnswer
export function answer(query: CursorQuery): CursorAnswer
export function answer(query: Query): PageAnswer | CursorAnswer
export function answer(query: Query): PageAnswer | CursorAnswer {
  const all = select(query)
  const size = query.pageSize

  if (!isCursorQuery(query)) {
    const start = (query.page - 1) * size
    return { rows: all.slice(start, start + size), total: all.length }
  }

  // Cursor mode: the token names a row; the direction says on which side of
  // the current page the wanted page lies.
  const { cursor } = query
  let start = 0
  if (cursor) {
    const at = all.findIndex(row => row.id === decode(cursor.token))
    if (at < 0) {
      throw new BadQuery('the cursor does not belong to this result')
    }
    start = cursor.direction === 'next' ? at + 1 : Math.max(0, at - size)
  }
  const rows = all.slice(start, start + size)
  return {
    rows,
    cursors: {
      prev: start > 0 ? encode(rows[0].id) : null,
      next: start + size < all.length ? encode(rows[rows.length - 1].id) : null
    }
  }
}
// #endregion answer

// #region handler
/** A POST endpoint, framework aside: the JSON body in, status and JSON out. */
export function handle(body: unknown): { status: number; json: unknown } {
  try {
    const query = parseQuery(body)
    // Keys the protocol does not know are yours (C-60): here a tenant.
    const { tenant } = query as Query & { tenant?: { id: number } }
    return { status: 200, json: { tenant: tenant?.id, ...answer(query) } }
  } catch (error) {
    if (error instanceof BadQuery) {
      return { status: 400, json: { error: error.message } }
    }
    throw error
  }
}
// #endregion handler
