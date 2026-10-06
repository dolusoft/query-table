// The per-table record of shared/: the only state the two plugins have in
// common (ADR 0003). It is keyed by the table object and never holds a
// reference that keeps a disposed table alive.
import type { QueryChangeReason } from '@dolusoft/query-protocol'

export interface SharedRecord {
  /** Flushes registered by plugins that hold pending input (filterInput). */
  beforeAction: Array<() => void>
  /** Cleanups registered by plugins; run once by `dispose`. */
  disposers: Array<() => void>
  /** How many updates the table emitted; tells a caller whether an action emitted. */
  emitted: number
  /** The reason the action being dispatched carries, if any. */
  reason: QueryChangeReason | null
}

const records = new WeakMap<object, SharedRecord>()
const disposed = new WeakSet<object>()

/**
 * The record of `table`, created on first use; `null` once the table is
 * disposed, so a late call (a debounce timer, an event after unmount) can
 * neither act nor bring the record back.
 */
export const recordOf = (table: object): SharedRecord | null => {
  if (disposed.has(table)) {
    return null
  }
  let record = records.get(table)
  if (!record) {
    record = { beforeAction: [], disposers: [], emitted: 0, reason: null }
    records.set(table, record)
  }
  return record
}

/** Drops the record of `table` for good and returns it (once). */
export const takeRecord = (table: object): SharedRecord | null => {
  if (disposed.has(table)) {
    return null
  }
  disposed.add(table)
  const record = records.get(table) ?? null
  records.delete(table)
  return record
}

/** Whether `dispose` ran for `table`. */
export const isDisposed = (table: object): boolean => disposed.has(table)

/** Whether `table` has a live record (for isolation tests). */
export const hasRecord = (table: object): boolean => records.has(table)
