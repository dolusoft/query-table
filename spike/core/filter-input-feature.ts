// Spike sketch of `filterInputFeature` (SPEC-v3 K2): the text typed per
// column, parsed with the 2.2 grammar, applied through TanStack's own
// `setColumnFilters`. It does not import serverQuery: it registers its flush
// with `shared/` and writes the column filter state; whoever owns that state
// (serverQuery here) decides what an applied filter means.
//
// Left out of the spike: debounce timers, the condition menu, the echo
// history (C-18). They are local state and do not touch TanStack.
import { assignTableAPIs, type TableFeature } from '@tanstack/table-core'

import { onBeforeAction, onDispose } from './shared'
import type { Column, FilterRule } from '../../src/contract'
import { parseFilterInput } from '../../src/filter/parse-filter-input'

interface Instance {
  /** Typed text per field that has not been applied yet. */
  pending: Map<string, string>
}

const instances = new WeakMap<object, Instance>()

interface ColumnLike {
  id: string
  columnDef: { meta?: { type?: Column['type'] } }
}

interface TableLike {
  getAllLeafColumns: () => ColumnLike[]
  setColumnFilters: (
    updater: (
      old: { id: string; value: unknown }[]
    ) => { id: string; value: unknown }[]
  ) => void
}

const pendingOf = (table: object) => {
  let instance = instances.get(table)
  if (!instance) {
    instance = { pending: new Map() }
    instances.set(table, instance)
  }
  return instance.pending
}

/**
 * Applies every pending text in one `setColumnFilters` call: one call is one
 * action, so the owner of the state emits once (C-04, C-13).
 */
const flush = (table: TableLike) => {
  const pending = pendingOf(table)
  if (pending.size === 0) {
    return
  }
  const parsed = new Map<string, FilterRule[]>()
  for (const column of table.getAllLeafColumns()) {
    const text = pending.get(column.id)
    if (text !== undefined) {
      parsed.set(
        column.id,
        parseFilterInput(text, {
          field: column.id,
          title: column.id,
          type: column.columnDef.meta?.type
        })
      )
    }
  }
  pending.clear()
  table.setColumnFilters(old => {
    const next = old.filter(entry => !parsed.has(entry.id))
    for (const [id, rules] of parsed) {
      if (rules.length > 0) {
        next.push({ id, value: rules })
      }
    }
    return next
  })
}

export const filterInputFeature: TableFeature = {
  initTableInstanceData: table => {
    pendingOf(table)
    onBeforeAction(table, () => flush(table as unknown as TableLike))
    onDispose(table, () => instances.delete(table))
  },

  constructTableAPIs: table => {
    assignTableAPIs('filterInputFeature' as never, table, {
      table_setFilterText: {
        fn: (field: string, text: string) => {
          pendingOf(table).set(field, text)
        }
      },
      table_flushPendingFilters: {
        fn: () => flush(table as unknown as TableLike)
      }
    })
  }
}
