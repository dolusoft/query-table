import type { FilterRule, FilterValue, TableQuery } from '../../src/contract'

const names = [
  'Charlie',
  'Alice',
  'Bob',
  'Dave',
  'Eve',
  'Frank',
  'Grace',
  'Heidi',
  'Ivan',
  'Judy',
  'Mallory',
  'Niaj',
  'Olivia',
  'Peggy',
  'Rupert'
]
const cities = ['Ankara', 'İstanbul', 'İzmir', 'Bursa', 'Antalya']

// Fixed fixtures, generated once by the consumer, never by the library.
export const createDemoRows = () =>
  Array.from({ length: 200 }, (_, i) => ({
    id: i + 1,
    name: names[i % names.length],
    city: cities[i % cities.length],
    age: 22 + ((i * 7) % 30),
    salary: 42000 + ((i * 3517) % 40000),
    joined: `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`
  }))

type DemoRow = ReturnType<typeof createDemoRows>[number]
const valueOf = (row: DemoRow, field: string) => row[field as keyof DemoRow]
// ISO dates compare chronologically; numbers stay numeric. Text matching is
// case-insensitive, a policy of this demo server rather than of the table.
const normalize = (value: FilterValue) =>
  typeof value === 'string' ? value.toLowerCase() : Number(value)

const matches = (row: DemoRow, rule: FilterRule): boolean => {
  const raw = valueOf(row, rule.field)
  if (raw === undefined) {
    return false
  }
  const value = normalize(raw)
  const expected = normalize(rule.value)
  const condition = rule.condition
  switch (condition) {
    case 'Contains':
      return String(value).includes(String(expected))
    case 'NotContains':
      return !String(value).includes(String(expected))
    case 'StartsWith':
      return String(value).startsWith(String(expected))
    case 'EndsWith':
      return String(value).endsWith(String(expected))
    case 'Equal':
      return value === expected
    case 'NotEqual':
      return value !== expected
    case 'GreaterThan':
      return value > expected
    case 'GreaterThanOrEqual':
      return value >= expected
    case 'LessThan':
      return value < expected
    case 'LessThanOrEqual':
      return value <= expected
    default: {
      const unhandled: never = condition
      throw new Error(`Unsupported demo filter condition: ${String(unhandled)}`)
    }
  }
}

export const queryDemoRows = (
  allRows: readonly DemoRow[],
  query: TableQuery
) => {
  const groups = new Map<string, FilterRule[]>()
  for (const rule of query.filters) {
    const group = groups.get(rule.field) ?? []
    group.push(rule)
    groups.set(rule.field, group)
  }
  const filtered = allRows.filter(row =>
    [...groups.values()].every(rules => {
      const negative = rules.every(
        rule =>
          rule.condition === 'NotEqual' || rule.condition === 'NotContains'
      )
      return negative
        ? rules.every(rule => matches(row, rule))
        : rules.some(rule => matches(row, rule))
    })
  )
  const sort = query.sort
  if (sort) {
    filtered.sort((a, b) => {
      const left = valueOf(a, sort.field)
      const right = valueOf(b, sort.field)
      const order =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'en')
      return sort.direction === 'asc' ? order : -order
    })
  }
  const offset = (query.page - 1) * query.pageSize
  return {
    rows: filtered.slice(offset, offset + query.pageSize),
    totalRows: filtered.length
  }
}
