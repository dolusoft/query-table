// Actions and their reason (ADR 0003). A plugin never emits by itself: the
// owner of the query state (serverQueryFeature) emits, and tells shared/ it
// did (`markEmitted`), so any plugin can ask whether an action it started
// produced an update without knowing how updates are emitted.
import type { QueryChangeReason } from '@dolusoft/query-protocol'

import { recordOf } from './registry'

/**
 * Registers a flush to run before every user action that builds on the
 * query (sort, page, page size, search). filterInputFeature registers its
 * pending drafts here (C-14). A no-op once the table is disposed.
 */
export const onBeforeAction = (table: object, flush: () => void): void => {
  recordOf(table)?.beforeAction.push(flush)
}

/**
 * Runs every registered flush; `true` when one of them emitted an update.
 * A filter action does not call this: applying a pending filter is itself the
 * filter action, so it cannot wait for itself.
 */
export const runBeforeAction = (table: object): boolean => {
  const record = recordOf(table)
  if (!record) {
    return false
  }
  const before = record.emitted
  for (const flush of record.beforeAction) {
    flush()
  }
  return record.emitted !== before
}

/** Called by the emitter after each update it emitted. */
export const markEmitted = (table: object): void => {
  const record = recordOf(table)
  if (record) {
    record.emitted += 1
  }
}

/**
 * Runs `action` (TanStack state changes) as one user action that carries
 * `reason`, and returns whether it emitted an update. The reason is read by
 * the emitter (`currentReason`) while the action runs; outside it, every
 * update carries the reason of its own kind. Nothing runs once the table is
 * disposed.
 */
export const dispatch = (
  table: object,
  action: () => void,
  reason?: QueryChangeReason
): boolean => {
  const record = recordOf(table)
  if (!record) {
    return false
  }
  const before = record.emitted
  const outer = record.reason
  record.reason = reason ?? outer
  try {
    action()
  } finally {
    record.reason = outer
  }
  return record.emitted !== before
}

/** The reason of the action being dispatched, `null` outside `dispatch`. */
export const currentReason = (table: object): QueryChangeReason | null =>
  recordOf(table)?.reason ?? null
