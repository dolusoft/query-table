import { computed, ref } from 'vue'

import {
  type createDemoRows,
  filterDemoRows,
  queryDemoRows
} from './fake-server'
import type { Column, FooterRow, TableQuery } from '../../src/contract'

// Scenario factories shared by the playground pages and the browser tests.
// Every call returns new objects: there is no module-level state, so two
// tables (or two tests) never share a query or a row list.

export { createDemoRows, queryDemoRows } from './fake-server'
export type { DemoRow } from './fake-server'

export const makeQuery = (overrides: Partial<TableQuery> = {}): TableQuery => ({
  page: 1,
  pageSize: 15,
  sort: null,
  filters: [],
  ...overrides
})

/** The people list: one column per row field, no special flags. */
export const peopleColumns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number', width: '90px' },
  { field: 'name', title: 'Name' },
  { field: 'city', title: 'City' },
  { field: 'age', title: 'Age', type: 'number' },
  { field: 'salary', title: 'Salary', type: 'number' },
  { field: 'joined', title: 'Joined', type: 'date' }
]

/** One column of every filter type, and a hidden column. */
export const typedColumns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'integer', width: '90px' },
  { field: 'name', title: 'Name (string)' },
  { field: 'age', title: 'Age (integer)', type: 'integer' },
  { field: 'salary', title: 'Salary (number)', type: 'number' },
  { field: 'joined', title: 'Joined (date)', type: 'date' },
  { field: 'active', title: 'Active (bool)', type: 'bool' },
  { field: 'city', title: 'City', hide: true }
]

/** Orders of one person: the rows of the nested table. */
export const ordersOf = (personId: number) =>
  Array.from({ length: 2 + (personId % 4) }, (_, i) => ({
    orderId: personId * 100 + i + 1,
    product: ['Desk', 'Chair', 'Lamp', 'Shelf', 'Monitor'][(personId + i) % 5],
    quantity: 1 + ((personId * (i + 3)) % 5),
    total: 50 + ((personId * 37 + i * 91) % 900)
  }))

export const orderColumns = (): Column[] => [
  { field: 'orderId', title: 'Order', type: 'integer' },
  { field: 'product', title: 'Product' },
  { field: 'quantity', title: 'Qty', type: 'integer' },
  { field: 'total', title: 'Total', type: 'number' }
]

/**
 * The footer of the people list: the count and the salary total over every
 * row that passes the filters (all pages, not only the one shown).
 */
export const peopleFooter = (
  allRows: ReturnType<typeof createDemoRows>,
  query: TableQuery
): FooterRow[] => {
  const matching = filterDemoRows(allRows, query)
  const salary = matching.reduce((sum, row) => sum + row.salary, 0)
  const average = matching.length ? Math.round(salary / matching.length) : 0
  return [
    {
      cells: [
        { field: 'name', text: `${matching.length} people` },
        { field: 'salary', text: salary }
      ]
    },
    {
      cells: [
        { field: 'name', text: 'Average' },
        { field: 'salary', text: average }
      ]
    }
  ]
}

/**
 * A consumer page backed by the fake server: it owns the query and answers
 * every change with the page the server would send.
 */
export const useFakeServer = <R extends object>(
  allRows: readonly R[],
  initial: Partial<TableQuery> = {}
) => {
  const query = ref<TableQuery>(makeQuery(initial))
  const result = computed(() => queryDemoRows(allRows, query.value))
  return { query, result }
}
