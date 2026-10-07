import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'

import type {
  Column,
  CursorQuery,
  FooterRow,
  TableQuery
} from '@dolusoft/query-table'

import type { Dataset, DemoRow } from './dataset'
import { cursorDemoPage, filterDemoRows, queryDemoRows } from './fake-server'

// Scenario factories of the playground pages (the browser tests use their own
// fixtures in tests/support). Every call returns new objects: there is no
// module-level state, so two tables never share a query or a row list. The
// rows and columns come from the dataset the header selects.

export { queryDemoRows } from './fake-server'
export { currentDataset } from './datasets'
export type { Dataset, DemoRow, DemoValue } from './dataset'

export const makeQuery = (overrides: Partial<TableQuery> = {}): TableQuery => ({
  page: 1,
  pageSize: 15,
  sort: null,
  filters: [],
  ...overrides
})

/** The title and type of one field, without its showcase width. */
export const columnOf = (data: Dataset, field: string): Column => {
  const column = { ...data.columns[field] }
  delete column.width
  return column
}

/** The plain list: one column per field, no special flags. */
export const listColumns = (data: Dataset): Column[] =>
  data.list.map(field =>
    field === 'id'
      ? { ...columnOf(data, field), width: '90px' }
      : columnOf(data, field)
  )

/**
 * A list wider than the page: ID and the primary field pinned to the left,
 * the rest with widths that make the table scroll sideways.
 */
export const wideColumns = (data: Dataset): Column[] =>
  data.wide.map((field, index) => {
    const column = columnOf(data, field)
    if (index < 2) {
      return {
        ...column,
        width: index === 0 ? '80px' : '160px',
        pinned: 'left'
      }
    }
    const narrow = column.type === 'integer' || column.type === 'bool'
    return { ...column, width: narrow ? '200px' : '220px' }
  })

/** One column of every filter type, and a hidden column. */
export const typedColumns = (data: Dataset): Column[] => {
  const { fields } = data
  const typed = (field: string) => {
    const column = columnOf(data, field)
    return {
      ...column,
      title: `${column.title} (${column.type ?? 'string'})`
    }
  }
  return [
    { field: 'id', title: 'ID', type: 'integer', width: '90px' },
    typed(fields.primary),
    typed(fields.count),
    typed(fields.amount),
    typed(fields.date),
    typed(fields.datetime),
    typed(fields.flag),
    { ...columnOf(data, fields.category), hide: true }
  ]
}

/**
 * The footer of a list: the count and the total of `fields.sum` over every
 * row that passes the filters (all pages, not only the one shown).
 */
export const footerOf = (
  data: Dataset,
  allRows: readonly DemoRow[],
  query: TableQuery
): FooterRow[] => {
  const matching = filterDemoRows(allRows, query)
  const field = data.fields.sum
  const total = matching.reduce((sum, row) => sum + Number(row[field]), 0)
  const average = matching.length ? Math.round(total / matching.length) : 0
  const { primary } = data.fields
  return [
    {
      cells: [
        {
          field: primary,
          text: `${matching.length} ${matching.length === 1 ? data.noun.one : data.noun.many}`
        },
        { field, text: Math.round(total * 100) / 100 }
      ]
    },
    {
      cells: [
        { field: primary, text: 'Average' },
        { field, text: average }
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

/**
 * The same fake server with a network delay: every query change starts a
 * request that answers after `delay()` milliseconds. `loading` is on while
 * the latest request runs; the rows of the previous answer stay until the
 * new one arrives, and an answer to an older query is dropped.
 */
export const useSlowServer = <R extends object>(
  allRows: readonly R[],
  initial: Partial<TableQuery>,
  delay: () => number
) => {
  const query = ref<TableQuery>(makeQuery(initial))
  const rows = shallowRef<R[]>([])
  const totalRows = ref<number | null>(null)
  const loading = ref(false)
  let latest = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const request = () => {
    const id = ++latest
    const asked = query.value
    loading.value = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (id !== latest) {
        return
      }
      const answer = queryDemoRows(allRows, asked)
      rows.value = answer.rows
      totalRows.value = answer.totalRows
      loading.value = false
    }, delay())
  }

  /** Forget the last answer and ask again: the table is in its first load. */
  const reset = () => {
    rows.value = []
    totalRows.value = null
    request()
  }

  watch(query, request, { immediate: true })
  onScopeDispose(() => clearTimeout(timer))

  return { query, rows, totalRows, loading, reload: request, reset }
}

const makeCursorQuery = (
  overrides: Partial<CursorQuery> = {}
): CursorQuery => ({
  cursor: null,
  pageSize: 10,
  sort: null,
  filters: [],
  ...overrides
})

/**
 * A consumer page backed by a cursor server (C-56): it owns the query and
 * passes the cursors of each answer back to the table. The search matches
 * `searchFields`.
 */
export const useCursorServer = <R extends object>(
  allRows: readonly R[],
  searchFields: readonly string[],
  initial: Partial<CursorQuery> = {}
) => {
  const query = ref<CursorQuery>(makeCursorQuery(initial))
  const result = computed(() =>
    cursorDemoPage(allRows, query.value, searchFields)
  )
  return { query, result }
}
