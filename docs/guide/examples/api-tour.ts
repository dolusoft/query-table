import type { CursorQuery } from '@dolusoft/query-protocol'

import { createServerTable } from './table'

// #region filter-api
export function filterInputTour() {
  const { table } = createServerTable({
    page: 1,
    pageSize: 10,
    sort: null,
    filters: []
  })
  const name = table.getColumn('name')!
  name.setFilterInput('ali*,!veli') // applied after `filterDebounce`
  name.applyFilterInput() // Enter: apply now
  name.setFilterCondition('Equal') // a menu pick; `null` clears the column
  name.clearFilterInput() // this column only
  table.flushPendingFilters() // every pending text, in ONE update
  table.clearAllFilters() // rules and drafts gone (reason `reset`)
}
// #endregion filter-api

// #region cursor
export function cursorTour() {
  const query: CursorQuery = {
    cursor: null,
    pageSize: 2,
    sort: null,
    filters: []
  }
  // The consumer's answer gave `cursors = { next: <token>, prev: null }`.
  const { table, updates } = createServerTable(query)
  table.getCanNextPage() // true: the next side has a cursor
  table.getCanPreviousPage() // false
  table.nextPage() // updates: [{ ...query, cursor: { token, direction: 'next' } }, 'page']
  return updates
}
// #endregion cursor
