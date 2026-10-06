// A headless consumer of the core: TanStack table-core with the stock
// features the table uses and the plugins, no framework, no DOM. It plays
// the adapter (projecting the query onto TanStack state) and the consumer
// (answering updates as told).
import type {
  PageCursors,
  PageQuery,
  Query,
  QueryChangeReason
} from '@dolusoft/query-protocol'
import {
  columnFilteringFeature,
  constructTable,
  globalFilteringFeature,
  rowPaginationFeature,
  type RowSelectionState,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures
} from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'

import { filterInputFeature } from '../../src/features/filter-input'
import {
  projectServerQuery,
  serverQueryFeature
} from '../../src/features/server-query'

export interface Row {
  id: number
  name: string
  age: number
}

export const rowsOf = (...ids: number[]): Row[] =>
  ids.map(id => ({ id, name: `n${id}`, age: id }))

export const start = (patch: Partial<PageQuery> = {}): PageQuery => ({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: [],
  ...patch
})

/** How the consumer answers an update. */
type Answer =
  /** Passes the update back at once, inside the emit. */
  | 'apply'
  /** Passes it back when the current task's microtasks run (Vue's flush). */
  | 'deferred'
  /** Keeps its query. */
  | 'ignore'
  /** Holds it until `answerLate()`. */
  | 'late'

export interface Options {
  query?: Query
  answer?: Answer
  rowCount?: number | null
  cursors?: PageCursors | null
  rows?: Row[]
  filterDebounce?: number
  selection?: RowSelectionState
}

const features = tableFeatures({
  coreReactivityFeature: storeReactivityBindings(),
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSelectionFeature,
  serverQueryFeature,
  filterInputFeature
})

const columns = [
  { id: 'name', accessorKey: 'name' as const },
  { id: 'age', accessorKey: 'age' as const, filterType: 'number' as const },
  {
    id: 'note',
    accessorFn: (row: Row) => row.name,
    enableSorting: false
  }
]

/** A table with both plugins and a consumer around it. */
export const makeTable = (options: Options = {}) => {
  let query: Query = options.query ?? start()
  let rows = options.rows ?? rowsOf(1, 2, 3)
  let rowCount = options.rowCount
  let cursors = options.cursors
  let selection: RowSelectionState = options.selection ?? {}
  const updates: Array<[Query, QueryChangeReason]> = []
  const selections: RowSelectionState[] = []
  const late: Array<() => void> = []

  const projected = () =>
    projectServerQuery({ query, rowCount, cursors, pageRows: rows.length })

  const table = constructTable({
    features,
    columns,
    data: rows,
    getRowId: row => String(row.id),
    query,
    rowCount: rowCount ?? undefined,
    cursors,
    pageCount: projected().pageCount,
    filterDebounce: options.filterDebounce,
    enableRowSelection: true,
    onRowSelectionChange: updater => {
      const next = typeof updater === 'function' ? updater(selection) : updater
      selections.push(next)
      if (options.answer !== 'ignore') {
        selection = next
        render()
      }
    },
    state: { ...projected().state, rowSelection: selection },
    onQueryChange: (next, reason) => {
      updates.push([next, reason])
      const apply = () => {
        query = next
        render()
      }
      switch (options.answer ?? 'apply') {
        case 'apply':
          apply()
          break
        case 'deferred':
          queueMicrotask(apply)
          break
        case 'late':
          late.push(apply)
          break
        default:
      }
    }
  })

  /** What the adapter does when a prop changes. */
  function render() {
    const { state, pageCount } = projected()
    table.setOptions(old => ({
      ...old,
      data: rows,
      query,
      rowCount: rowCount ?? undefined,
      cursors,
      pageCount,
      state: { ...state, rowSelection: selection }
    }))
  }

  return {
    table,
    updates,
    selections,
    reasons: () => updates.map(([, reason]) => reason),
    queries: () => updates.map(([next]) => next),
    get query() {
      return query
    },
    /** The consumer changes the query from outside (C-01). */
    setQuery(next: Query) {
      query = next
      render()
    },
    setRows(next: Row[], total?: number | null) {
      rows = next
      rowCount = total
      render()
    },
    setCursors(next: PageCursors | null) {
      cursors = next
      render()
    },
    answerLate: () => late.splice(0).forEach(apply => apply()),
    column: (id: string) => table.getColumn(id)!
  }
}

/** Lets the microtask that ends the tick run. */
export const tick = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
