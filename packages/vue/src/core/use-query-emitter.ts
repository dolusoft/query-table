import { watch } from 'vue'

import type { QueryChangeReason, TableQuery } from '../contract'
import { cloneQuery, sameQuery } from './query'

export interface QueryEmitterOptions {
  /** The query the table currently shows. */
  query: () => TableQuery
  /** Called with a copy of the new query; nothing in it is shared. */
  emit: (query: TableQuery, reason: QueryChangeReason) => void
}

/**
 * The table never writes to its props. A user action builds a new query from
 * `base()` and passes it to `update`, which emits it. Several actions in one
 * tick (a pending filter flushed before a page click) must stack, so the last
 * emitted query is the base until the consumer's update arrives or the tick
 * ends.
 */
export const useQueryEmitter = (options: QueryEmitterOptions) => {
  let lastEmitted: TableQuery | null = null

  /** The query a new update must build on (includes updates not yet echoed). */
  const base = (): TableQuery => lastEmitted ?? options.query()

  watch(
    options.query,
    () => {
      lastEmitted = null
    },
    { flush: 'sync' }
  )

  /** Emits `next` unless it equals the base; the same query is swallowed. */
  const update = (next: TableQuery, reason: QueryChangeReason) => {
    if (sameQuery(next, base())) {
      return
    }
    lastEmitted = cloneQuery(next)
    queueMicrotask(() => {
      lastEmitted = null
    })
    options.emit(cloneQuery(next), reason)
  }

  return { base, update }
}
