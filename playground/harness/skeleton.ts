import { computed } from 'vue'

// Skeleton rows are the consumer's markup, not the table's. The table only
// knows `loading` (and an optional `loading` slot, one row over the body); it
// has no idea what a "placeholder" is. So the consumer hands it placeholder
// rows as ordinary `rows`, and a `cell-<field>` slot draws a bar in their
// cells (SkeletonCell.vue). Column widths, pinned columns and the row height
// then come from the table itself and nothing moves when the real rows land.

export interface SkeletonRow {
  /** Negative, so it never meets the key of a real row. */
  id: number
  skeleton: true
}

export const isSkeletonRow = (row: object): row is SkeletonRow =>
  'skeleton' in row

const placeholders = (count: number): SkeletonRow[] =>
  Array.from({ length: count }, (_, index) => ({
    id: -(index + 1),
    skeleton: true
  }))

interface SkeletonRowsOptions<R extends object> {
  /** The rows of the last answer. */
  rows: () => readonly R[]
  loading: () => boolean
  /** How many placeholder rows to draw: the page size of the query. */
  pageSize: () => number
  /**
   * Replace the rows of the last answer while loading. Off: they stay and
   * only the first load (no rows yet) shows placeholders.
   */
  replace?: () => boolean
}

/** The `rows` to give the table: placeholders while loading, else the answer. */
export const useSkeletonRows = <R extends object>(
  options: SkeletonRowsOptions<R>
) =>
  computed<Array<R | SkeletonRow>>(() => {
    const rows = options.rows()
    const replace = options.replace?.() ?? false
    if (options.loading() && (rows.length === 0 || replace)) {
      return placeholders(options.pageSize())
    }
    return [...rows]
  })

/**
 * Consumer CSS for a refetch that keeps the rows: dim the body while the root
 * carries `data-loading`, and hide the expand buttons of placeholder rows.
 * Set it on the element around the table.
 */
export const dimWhileLoading =
  '[&_.qt-datatable[data-loading]_tbody]:opacity-60 [&_tbody]:transition-opacity [&_tr:has([data-slot=skeleton])_.qt-expand]:invisible'
