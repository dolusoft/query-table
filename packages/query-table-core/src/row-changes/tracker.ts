import { cloneQuery, sameQuery, type Query } from '@dolusoft/query-protocol'

import { sameValue } from './same-value'

/**
 * What produced the rows given with it (C-93): `live` is a change of the
 * data under the same query and flashes; `append` adds a page and
 * flashes nothing; `snapshot` (an answer to a query) and `reset` (another
 * source) start over.
 */
export type RowsUpdate = 'snapshot' | 'append' | 'live' | 'reset'

/** A row's identity: the value of `rowKey`. */
export type RowChangeKey = string | number

/** What the tracker reads on every update. */
export interface RowChangeInput<T> {
  rows: readonly T[]
  query: Query
  /** The consumer is fetching (`loading`). */
  loading: boolean
  /** The fields of the drawn columns: only these are compared. */
  fields: readonly string[]
  /** What produced `rows`, when the consumer says so; read when `rows` changes. */
  hint: RowsUpdate | undefined
  /** Produce no change (a hidden document); the baseline still moves. */
  quiet: boolean
}

/** What changed since the previous update. */
export interface RowChanges {
  /** The context changed (query, `snapshot`, `reset`): every mark goes. */
  reset: boolean
  /** Keys that are new under the same context. */
  added: RowChangeKey[]
  /** The changed fields of each key that was there before. */
  changed: Map<RowChangeKey, string[]>
  /** Fields that are no longer drawn: their marks go. */
  droppedFields: string[]
  /** Some row had no key, or a key two rows share (the rows given now). */
  badKeys: boolean
}

export interface RowChangeTracker<T> {
  /** Read the current inputs and say what changed since the last call. */
  update(input: RowChangeInput<T>): RowChanges
  /** Forget everything: the next update is a baseline. */
  clear(): void
}

type Reader = (row: object) => unknown

const readerOf = (field: string): Reader => {
  if (!field.includes('.')) {
    return row => (row as Record<string, unknown>)[field]
  }
  const path = field.split('.')
  return row =>
    path.reduce<unknown>(
      (value, key) =>
        value === null || value === undefined
          ? undefined
          : (value as Record<string, unknown>)[key],
      row
    )
}

/**
 * Compares consecutive `rows` by key (C-92) and tells live changes from
 * answers: with a `hint` exactly, without one from the query, `loading`
 * and the first rows (best effort). Pure: no DOM, no clock, no timer.
 */
export const createRowChangeTracker = <T extends object>(
  keyOf: (row: T, index: number) => RowChangeKey
): RowChangeTracker<T> => {
  let started = false
  let query: Query | null = null
  let rows: readonly T[] = []
  let fields: readonly string[] = []
  let baseline = new Map<RowChangeKey, T>()
  /**
   * A query changed and its answer has not settled: no rows arrived for it
   * with `loading` off, and `loading` did not turn off after rows arrived.
   */
  let settling = false
  /** Rows arrived while settling (the answer, or data for the old query). */
  let answered = false
  /** Some non-empty rows were seen since the start. */
  let seenRows = false
  /**
   * The query changed while a hint was given: the rows that answer it
   * start over, unless they are tagged `append`.
   */
  let pendingReset = false
  const readers = new Map<string, Reader>()
  const reader = (field: string): Reader => {
    let read = readers.get(field)
    if (!read) {
      read = readerOf(field)
      readers.set(field, read)
    }
    return read
  }

  const clear = () => {
    started = false
    query = null
    rows = []
    fields = []
    baseline = new Map()
    settling = false
    answered = false
    seenRows = false
    pendingReset = false
    readers.clear()
  }

  const update = (input: RowChangeInput<T>): RowChanges => {
    const result: RowChanges = {
      reset: false,
      added: [],
      changed: new Map(),
      droppedFields: [],
      badKeys: false
    }
    const first = !started
    started = true

    if (query === null || !sameQuery(query, input.query)) {
      if (!first) {
        settling = true
        answered = false
        // With a hint the rows that answer the query decide: `append` (the
        // next page of an infinite list) keeps what runs, anything else
        // starts over. Without one the query change starts over now.
        if (input.hint === undefined) {
          result.reset = true
        } else {
          pendingReset = true
        }
      }
      query = cloneQuery(input.query)
    }

    const compared = first ? [] : input.fields.filter(f => fields.includes(f))
    if (!first) {
      result.droppedFields = fields.filter(f => !input.fields.includes(f))
    }
    fields = [...input.fields]

    if (first || input.rows !== rows) {
      let quiet: boolean
      if (input.hint !== undefined) {
        // The first rows after a query change are its answer whatever the
        // hint says: a consumer that always passes `live` still sees no
        // flash on a sort or a filter.
        quiet = input.hint !== 'live' || settling || !seenRows
        if (
          input.hint === 'snapshot' ||
          input.hint === 'reset' ||
          (pendingReset && input.hint !== 'append')
        ) {
          result.reset = !first
        }
        pendingReset = false
        settling = false
      } else {
        if (pendingReset) {
          result.reset = true
          pendingReset = false
        }
        quiet = first || settling || input.loading || !seenRows
        if (!input.loading) {
          settling = false
        } else if (settling) {
          answered = true
        }
      }
      quiet ||= input.quiet

      const next = new Map<RowChangeKey, T>()
      const reads = compared.map(reader)
      input.rows.forEach((row, index) => {
        const key = keyOf(row, index)
        if (key === undefined || key === null || next.has(key)) {
          result.badKeys = true
        }
        next.set(key, row)
        if (quiet) {
          return
        }
        const before = baseline.get(key)
        if (before === undefined) {
          result.added.push(key)
          return
        }
        if (before === row) {
          return
        }
        let changedFields: string[] | undefined
        for (let i = 0; i < reads.length; i++) {
          if (!sameValue(reads[i](before), reads[i](row))) {
            ;(changedFields ??= []).push(compared[i])
          }
        }
        if (changedFields) {
          result.changed.set(key, changedFields)
        }
      })
      baseline = next
      rows = input.rows
      if (input.rows.length > 0) {
        seenRows = true
      }
    } else if (settling && answered && !input.loading) {
      // The answer arrived while loading and loading turned off now.
      settling = false
    }
    return result
  }

  return { update, clear }
}
