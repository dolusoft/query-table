import type { Column, FilterRule, TableQuery } from '../../src/contract'

// Data and DOM helpers of the browser specs. Nothing here touches the
// playground skin or its harness, so specs of the bare component (the DOM
// contract, cell-slot controls) import this file and not helpers.ts.

export const columns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'number' },
  { field: 'joined', title: 'Joined', type: 'date' }
]

export const rows = (count = 5) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Name ${i + 1}`,
    age: 20 + i,
    joined: `2024-0${(i % 9) + 1}-1${i % 9}`
  }))

export const makeQuery = (overrides: Partial<TableQuery> = {}): TableQuery => ({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: [],
  ...overrides
})

export const rule = (
  field: string,
  condition: FilterRule['condition'],
  value: FilterRule['value']
): FilterRule => ({ field, condition, value })

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The element behind a selector, for geometry. */
export const el = <E extends Element = HTMLElement>(css: string) => {
  const found = document.querySelector<E>(css)
  if (!found) {
    throw new Error(`nothing matches ${css}`)
  }
  return found
}
