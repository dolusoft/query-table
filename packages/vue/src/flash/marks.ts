import type { RowChangeKey } from '@dolusoft/query-table-core/row-changes'

/** The value of `data-flash`: a new value restarts the CSS animation. */
export type FlashPhase = 'a' | 'b'

/**
 * One running flash. Updated in place when it restarts, so a stream of
 * changes allocates nothing per change (C-94).
 */
export interface Mark {
  /** `performance.now()` when the flash began. */
  start: number
  /** `start` plus the duration: from then on the mark is not drawn. */
  end: number
  /** Bumped on every start or restart: the identity of this flash. */
  gen: number
  phase: FlashPhase
  /** The frame the phase last changed in: one change per frame. */
  flipFrame: number
}

/** The marks of one row key: the row flash and the cell flashes by field. */
export interface RowMarks {
  row: Mark | null
  cells: Map<string, Mark> | null
}

/** A mark that is still running at `now`, else `null`. */
export const live = (mark: Mark | null | undefined, now: number) =>
  mark && mark.end > now ? mark : null

/**
 * The marks of one table (C-94): row and cell flashes by row key. Starting
 * a flash that runs already restarts it, and the phase changes at most once
 * a frame, so changes within one frame are one visual restart (K33-4).
 */
export const createMarks = () => {
  const byKey = new Map<RowChangeKey, RowMarks>()
  let gen = 0

  const restart = (
    mark: Mark | null | undefined,
    now: number,
    duration: number,
    frame: number
  ): Mark => {
    gen++
    if (!mark) {
      return {
        start: now,
        end: now + duration,
        gen,
        phase: 'a',
        flipFrame: frame
      }
    }
    mark.start = now
    mark.end = now + duration
    mark.gen = gen
    if (mark.flipFrame !== frame) {
      mark.phase = mark.phase === 'a' ? 'b' : 'a'
      mark.flipFrame = frame
    }
    return mark
  }

  const entry = (key: RowChangeKey): RowMarks => {
    let marks = byKey.get(key)
    if (!marks) {
      marks = { row: null, cells: null }
      byKey.set(key, marks)
    }
    return marks
  }

  /** Flash the row of `key`; its cell flashes go (a new row is new as a whole). */
  const flashRow = (
    key: RowChangeKey,
    now: number,
    duration: number,
    frame: number
  ) => {
    const marks = entry(key)
    marks.row = restart(marks.row, now, duration, frame)
    marks.cells?.clear()
  }

  const flashCell = (
    key: RowChangeKey,
    field: string,
    now: number,
    duration: number,
    frame: number
  ) => {
    const marks = entry(key)
    const cells = (marks.cells ??= new Map<string, Mark>())
    cells.set(field, restart(cells.get(field), now, duration, frame))
  }

  const isEmpty = (marks: RowMarks) =>
    marks.row === null && (marks.cells === null || marks.cells.size === 0)

  /** Drop every row flash (`flash.rows` turned off). True when one went. */
  const clearRows = (): boolean => {
    let dropped = false
    for (const [key, marks] of byKey) {
      if (marks.row) {
        marks.row = null
        dropped = true
      }
      if (isEmpty(marks)) {
        byKey.delete(key)
      }
    }
    return dropped
  }

  /** Drop the cell flashes of `fields`, or of every field. True when one went. */
  const clearCells = (fields?: readonly string[]): boolean => {
    let dropped = false
    for (const [key, marks] of byKey) {
      const cells = marks.cells
      if (cells && cells.size > 0) {
        if (fields) {
          for (const field of fields) {
            dropped = cells.delete(field) || dropped
          }
        } else {
          cells.clear()
          dropped = true
        }
      }
      if (isEmpty(marks)) {
        byKey.delete(key)
      }
    }
    return dropped
  }

  /** Drop everything. True when something went. */
  const clear = (): boolean => {
    const had = byKey.size > 0
    byKey.clear()
    return had
  }

  /**
   * Drop the marks that end by `until`; the nearest end of the ones left,
   * or `Infinity`. True in `dropped` when one went.
   */
  const prune = (until: number) => {
    let nearest = Infinity
    let dropped = false
    for (const [key, marks] of byKey) {
      if (marks.row) {
        if (marks.row.end <= until) {
          marks.row = null
          dropped = true
        } else {
          nearest = Math.min(nearest, marks.row.end)
        }
      }
      if (marks.cells) {
        for (const [field, mark] of marks.cells) {
          if (mark.end <= until) {
            marks.cells.delete(field)
            dropped = true
          } else {
            nearest = Math.min(nearest, mark.end)
          }
        }
      }
      if (isEmpty(marks)) {
        byKey.delete(key)
      }
    }
    return { nearest, dropped }
  }

  return {
    get: (key: RowChangeKey) => byKey.get(key),
    get size() {
      return byKey.size
    },
    /** The generation of the last start. */
    get gen() {
      return gen
    },
    flashRow,
    flashCell,
    clearRows,
    clearCells,
    clear,
    prune
  }
}

export type Marks = ReturnType<typeof createMarks>
