// #region imports
import type { PageCursors, Query } from '@dolusoft/query-protocol'
import {
  filterInputFeature,
  projectServerQuery,
  serverQueryFeature
} from '@dolusoft/query-table-core'
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
// #endregion imports

import { answer, type Person } from './server'

// #region features
// TanStack's own features do the stock work; the two plugins sit on top. A
// feature the table does not need (here none) is simply left out.
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
  { id: 'joined', accessorKey: 'joined' as const, filterType: 'date' as const },
  { id: 'active', accessorKey: 'active' as const, filterType: 'bool' as const }
]
// #endregion features

/**
 * The consumer around the table: it owns the query, the rows, the total (or
 * the cursors) and the selection, and tells the table what they are.
 */
export function createServerTable(initial: Query) {
  // #region loop
  let query = initial
  let rows: Person[] = []
  let total: number | undefined
  let cursors: PageCursors | null = null
  let selection: RowSelectionState = {}
  const updates: Array<[Query, string]> = []

  /** Tells the table what the consumer holds now (the "adapter" step). */
  const render = () => {
    const { state, pageCount } = projectServerQuery({
      query,
      rowCount: total,
      cursors,
      pageRows: rows.length
    })
    table.setOptions(old => ({
      ...old,
      data: rows,
      query,
      rowCount: total,
      cursors,
      pageCount,
      // The slices the query owns come from the projection; the others
      // (row selection) are the consumer's own.
      state: { ...state, rowSelection: selection }
    }))
  }

  /** Fetches with the query given, then shows the answer. */
  const load = (next: Query) => {
    const result = answer(next)
    rows = result.rows
    if ('cursors' in result) {
      cursors = result.cursors
    } else {
      total = result.total
    }
    render()
  }

  const table = constructTable({
    features,
    columns,
    data: rows,
    getRowId: row => String(row.id),
    query,
    filterDebounce: 0,
    enableRowSelection: true,
    // The table never changes the query itself: it tells you, you decide.
    // Take the new query at once, fetch afterwards (C-19).
    onQueryChange: (next, reason) => {
      updates.push([next, reason])
      query = next
      render()
      load(next)
    },
    onRowSelectionChange: updater => {
      selection = typeof updater === 'function' ? updater(selection) : updater
      render()
    },
    state: { rowSelection: selection }
  })

  load(query)
  // #endregion loop

  return {
    table,
    updates,
    get query() {
      return query
    },
    get rows() {
      return rows
    },
    get selection() {
      return selection
    },
    /** The consumer changes the query from outside: nothing is emitted. */
    setQuery(next: Query) {
      query = next
      load(next)
    }
  }
}
