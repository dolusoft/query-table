import { dispose } from '@dolusoft/query-table-core'

import { createServerTable } from './table'

// #region dispose
// TanStack's `TableFeature` has no dispose hook, so the plugins give you one:
// call `dispose(table)` when the table goes away (a Vue component's
// `onScopeDispose`, a React effect cleanup). Pending debounce timers are
// cleared, and nothing the table does afterwards emits an update.
export function mountAndLeave() {
  const { table, updates } = createServerTable({
    page: 1,
    pageSize: 10,
    sort: null,
    filters: []
  })
  table.getColumn('name')!.setFilterInput('a')
  dispose(table)
  table.nextPage() // inert: emits nothing
  return updates
}
// #endregion dispose
