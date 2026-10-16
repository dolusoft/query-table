import type { BodyRow } from '../use-query-table'

/** A group key: what `groupBy` returns for a row that belongs to a group. */
export type GroupKey = string | number

/** One group: a run of consecutive rows with the same key (C-101). */
export interface GroupRun<T> {
  key: GroupKey
  /** Rows in the group. */
  count: number
  /** Its first row and that row's index in `rows`. */
  row: T
  index: number
  /** Position of its first row among the rows it was computed over. */
  start: number
  /** Identity of its header row: the key and the how-many-th run of it. */
  id: string
}

/** The groups of a list of rows and, per row, the group it belongs to. */
export interface GroupRuns<T> {
  runs: GroupRun<T>[]
  /** Per position: the index of its group in `runs`, or -1. */
  groupOf: Int32Array
  /** Per position: the number of header rows drawn up to and with it. */
  headersThrough: Int32Array
}

/** The runs as a string (start and count of each), or `null` without groups. */
export const groupShape = <T>(groups: GroupRuns<T> | null): string | null =>
  groups ? groups.runs.map(run => `${run.start}:${run.count}`).join(',') : null

/**
 * Splits `rows` into runs of consecutive rows with the same `groupBy` key
 * (C-101). The rows are not reordered: a key that comes back after another
 * starts a new run. `null` and `undefined` mean no group.
 */
export const groupRuns = <T>(
  rows: readonly BodyRow<T>[],
  groupBy: (row: T, index: number) => GroupKey | null | undefined
): GroupRuns<T> => {
  const runs: GroupRun<T>[] = []
  const groupOf = new Int32Array(rows.length)
  const headersThrough = new Int32Array(rows.length)
  const seen = new Map<GroupKey, number>()
  let current: GroupRun<T> | null = null
  for (let p = 0; p < rows.length; p++) {
    const { row, index } = rows[p]
    const key = groupBy(row, index)
    // NaN never equals itself: it is no group, not a group per row.
    if (key === null || key === undefined || Number.isNaN(key)) {
      current = null
      groupOf[p] = -1
    } else if (current && current.key === key) {
      current.count++
      groupOf[p] = runs.length - 1
    } else {
      const nth: number = seen.get(key) ?? 0
      seen.set(key, nth + 1)
      current = {
        key,
        count: 1,
        row,
        index,
        start: p,
        id: `${typeof key}:${String(key)}#${nth}`
      }
      runs.push(current)
      groupOf[p] = runs.length - 1
    }
    headersThrough[p] = runs.length
  }
  return { runs, groupOf, headersThrough }
}
