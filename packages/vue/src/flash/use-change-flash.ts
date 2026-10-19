import {
  createRowChangeTracker,
  type RowChangeKey,
  type RowsUpdate
} from '@dolusoft/query-table-core/row-changes'
import {
  effectScope,
  getCurrentInstance,
  getCurrentScope,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onScopeDispose,
  shallowRef,
  watch,
  type ComponentInternalInstance,
  type EffectScope,
  type Ref,
  type ShallowRef
} from 'vue'

import type { FlashOptions, Query } from '../contract'
import type { RowKey } from '../use-query-table'
import { createMarks, live, type FlashPhase, type Mark } from './marks'
import { readDuration } from './read-duration'

// Replaced by the consumer's bundler, just as in Vue's esm-bundler build.
declare const process: { env: { NODE_ENV?: string } }

const warn = (message: string) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return
    }
  } catch {
    // No `process`: a development build.
  }
  console.warn(`[QueryTable] ${message}`)
}

/** The inline custom property of an element bound after its flash began. */
const elapsedProperty = '--qt-flash-elapsed'

export interface ChangeFlashOptions<T extends object> {
  flash: () => boolean | FlashOptions | undefined
  rowsUpdate: () => RowsUpdate | undefined
  rows: () => readonly T[]
  query: () => Query
  loading: () => boolean
  /** The fields of the drawn columns. */
  fields: () => readonly string[]
  rowKey: () => RowKey<T>
  table: Readonly<Ref<HTMLTableElement | null>>
}

/**
 * The live marks of one row (K311-6): the `data-flash` value of the row and
 * of each cell with a mark of its own.
 */
export interface RowFlash {
  row?: FlashPhase
  cells?: Readonly<Record<string, FlashPhase>>
}

/** What the body draws with: the marks and the binding hook (C-94). */
export interface FlashView {
  /**
   * The live marks of the row of `key`, or `undefined`. Read in the body's
   * render: a change of the marks draws the body again. Equal marks give the
   * same object, so a row whose marks did not change is not drawn again.
   */
  of: (key: RowChangeKey) => RowFlash | undefined
  /**
   * Called with a data row's `tr` after it is mounted or patched: writes
   * `--qt-flash-elapsed` on the row and on its cells that were bound after
   * their flash began, or whose flash changed. Reads nothing reactive: it
   * runs while the row's render effect is active.
   */
  bind: (el: HTMLElement, key: RowChangeKey) => void
}

interface Controller {
  view: FlashView
  /** Remove the elapsed times written on the body (`flash` turned off). */
  unbind: () => void
  update: () => void
  deactivate: () => void
  activate: () => void
}

interface Kinds {
  rows: boolean
  cells: boolean
}

const kindsOf = (value: boolean | FlashOptions | undefined): Kinds =>
  typeof value === 'object'
    ? { rows: value.rows !== false, cells: value.cells !== false }
    : { rows: true, cells: true }

const keyReader =
  <T extends object>(rowKey: NonNullable<RowKey<T>>) =>
  (row: T, index: number): RowChangeKey =>
    typeof rowKey === 'function'
      ? rowKey(row, index)
      : (row as Record<string, RowChangeKey>)[rowKey]

/**
 * The flash of one table while `flash` is on: feeds the tracker, keeps the
 * marks, reads the duration, runs the one timer and binds the elapsed time.
 * It lives in the effect scope it is created in and goes with it.
 */
const startFlash = <T extends object>(o: ChangeFlashOptions<T>): Controller => {
  let rowKey = o.rowKey()
  let keyOf = rowKey === undefined ? null : keyReader(rowKey)
  const newTracker = () =>
    createRowChangeTracker<T>((row, index) => keyOf!(row, index))
  let tracker = newTracker()
  const marks = createMarks()
  /** Bumped when the drawn marks change: the body reads it. */
  const version = shallowRef(0)
  let kinds = kindsOf(o.flash())

  let active = true
  let warnedKey = false
  let warnedBadKeys = false

  // ---- clock: the frame and the one timer (C-94) ---------------------------

  let frame = 0
  let frameRequest: number | undefined
  /** The duration read in this frame (valid while a frame is requested). */
  let duration = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  /** The end the timer wakes at. */
  let timerAt = Infinity
  /**
   * The first generation started in the update being drawn: an element
   * bound to it in the same render gets no elapsed time.
   */
  let freshFrom = Infinity

  /** A frame went by: the next change flips the phase, the duration is read again. */
  const requestFrame = () => {
    frameRequest ??= requestAnimationFrame(() => {
      frameRequest = undefined
      frame++
    })
  }
  const durationNow = () => {
    if (frameRequest === undefined) {
      duration = readDuration(o.table.value)
      // Read once a frame, a zero length (reduced motion) included.
      requestFrame()
    }
    return duration
  }

  const stopClock = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
      timerAt = Infinity
    }
    if (frameRequest !== undefined) {
      cancelAnimationFrame(frameRequest)
      frameRequest = undefined
    }
  }

  /** Wake at `end`: drop what ended, then wake at the next end. */
  const wakeAt = (end: number) => {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    timerAt = end
    timer = setTimeout(
      () => {
        timer = undefined
        timerAt = Infinity
        // Only what has ended goes; the next wake takes the rest.
        const { nearest, dropped } = marks.prune(performance.now())
        if (dropped) {
          pruneDrawn()
          version.value++
        }
        if (nearest !== Infinity) {
          wakeAt(nearest)
        }
      },
      Math.max(0, end - performance.now())
    )
  }

  /** Everything goes: marks, timer, frame and the rows compared against. */
  const resetAll = () => {
    tracker.clear()
    stopClock()
    drawn.clear()
    if (marks.clear()) {
      version.value++
    }
  }

  // ---- the marks each row is drawn with (K311-6) ----------------------------

  /**
   * The last `RowFlash` of each row key, with the live marks it was made
   * from as a text of copied numbers (field, phase, generation): never the
   * `Mark` objects, which a restart updates in place. Pruned with the marks.
   */
  const drawn = new Map<RowChangeKey, { live: string; flash: RowFlash }>()
  const pruneDrawn = () => {
    for (const key of drawn.keys()) {
      if (!marks.get(key)) {
        drawn.delete(key)
      }
    }
  }

  // ---- marks from the tracker (C-93) ---------------------------------------

  const update = () => {
    if (!active) {
      return
    }
    // A new `rowKey` starts over: the keys mean something else now (K33-3).
    if (o.rowKey() !== rowKey) {
      rowKey = o.rowKey()
      keyOf = rowKey === undefined ? null : keyReader(rowKey)
      resetAll()
      tracker = newTracker()
    }
    if (keyOf === null) {
      if (!warnedKey) {
        warnedKey = true
        warn('`flash` needs `rowKey`; it is ignored without one (C-93).')
      }
      return
    }
    let changed = false
    // A kind turned off: its marks go now (K33-8).
    const next = kindsOf(o.flash())
    if (!next.rows && kinds.rows) {
      changed = marks.clearRows() || changed
    }
    if (!next.cells && kinds.cells) {
      changed = marks.clearCells() || changed
    }
    kinds = next
    const result = tracker.update({
      rows: o.rows(),
      query: o.query(),
      loading: o.loading(),
      fields: kinds.cells ? o.fields() : [],
      hint: o.rowsUpdate(),
      // A hidden document flashes nothing and replays nothing (K33-8).
      quiet: document.hidden
    })
    if (result.badKeys && !warnedBadKeys) {
      warnedBadKeys = true
      warn(
        '`flash` found a row without a `rowKey` value, or a key two rows share; the index is never used instead (C-93).'
      )
    }
    if (result.reset) {
      stopClock()
      changed = marks.clear() || changed
    }
    if (result.droppedFields.length > 0) {
      changed = marks.clearCells(result.droppedFields) || changed
    }
    const added = kinds.rows ? result.added : []
    const cells = kinds.cells ? result.changed : null
    if (added.length > 0 || (cells !== null && cells.size > 0)) {
      const length = durationNow()
      // No duration (a reduced-motion skin): no mark; the rows compared
      // against moved all the same (K33-5).
      if (length > 0) {
        const at = performance.now()
        const firstGen = marks.gen + 1
        for (const key of added) {
          marks.flashRow(key, at, length, frame)
        }
        cells?.forEach((fields, key) => {
          for (const field of fields) {
            marks.flashCell(key, field, at, length, frame)
          }
        })
        changed = true
        // Flashes started now are bound in this update's render: no time
        // has gone for them yet.
        if (freshFrom === Infinity) {
          freshFrom = firstGen
          void nextTick(() => {
            freshFrom = Infinity
          })
        }
        requestFrame()
        // A timer set for a later end (the skin shortened the duration)
        // is set again; one set for an earlier end wakes first.
        if (at + length < timerAt) {
          wakeAt(at + length)
        }
      }
    }
    if (changed) {
      pruneDrawn()
      version.value++
    }
  }

  // The rows at the start are the baseline.
  update()

  // ---- drawing (C-94) ------------------------------------------------------

  /** The generation bound to an element, and the elapsed value written on it. */
  const bound = new WeakMap<Element, number>()
  const written = new WeakMap<Element, string>()
  /** Rows with something bound on them or on one of their cells. */
  const boundRows = new WeakSet<Element>()
  /** The row flash a cell was last seen under. */
  const seenUnder = new WeakMap<Element, number>()

  const bindTo = (
    el: HTMLElement,
    mark: Mark | null,
    now: number,
    blockInherited: boolean
  ) => {
    const gen = bound.get(el)
    if (!mark) {
      if (gen !== undefined) {
        bound.delete(el)
        written.delete(el)
        el.style.removeProperty(elapsedProperty)
      }
      return
    }
    if (gen === mark.gen) {
      // Vue drops the whole `style` attribute when a cell's style binding
      // goes away: put the value back, unchanged.
      const value = written.get(el) ?? ''
      if (value !== '' && el.style.getPropertyValue(elapsedProperty) === '') {
        el.style.setProperty(elapsedProperty, value)
      }
      return
    }
    const elapsed = mark.gen >= freshFrom ? 0 : now - mark.start
    // A cell's own fresh flash must not inherit the row's elapsed time.
    const value =
      elapsed >= 1 ? `${Math.round(elapsed)}ms` : blockInherited ? '0ms' : ''
    if (value === '') {
      el.style.removeProperty(elapsedProperty)
    } else {
      el.style.setProperty(elapsedProperty, value)
    }
    bound.set(el, mark.gen)
    written.set(el, value)
  }

  const view: FlashView = {
    of: key => {
      // Read by the body's render: a change of the marks draws it again.
      void version.value
      const rowMarks = keyOf === null ? undefined : marks.get(key)
      if (!rowMarks) {
        drawn.delete(key)
        return undefined
      }
      // The clock is read only for a row that has a mark.
      const now = performance.now()
      const rowMark = live(rowMarks.row, now)
      let text = rowMark ? `${rowMark.phase}${rowMark.gen}` : ''
      rowMarks.cells?.forEach((mark, field) => {
        if (live(mark, now)) {
          text += `|${field}:${mark.phase}${mark.gen}`
        }
      })
      if (text === '') {
        drawn.delete(key)
        return undefined
      }
      const last = drawn.get(key)
      if (last?.live === text) {
        return last.flash
      }
      const flash: RowFlash = {}
      if (rowMark) {
        flash.row = rowMark.phase
      }
      let cells: Record<string, FlashPhase> | undefined
      rowMarks.cells?.forEach((mark, field) => {
        if (live(mark, now)) {
          ;(cells ??= {})[field] = mark.phase
        }
      })
      if (cells) {
        flash.cells = cells
      }
      drawn.set(key, { live: text, flash })
      return flash
    },
    bind: (tr, key) => {
      if (keyOf === null) {
        return
      }
      const rowMarks = marks.get(key)
      // Most rows have no flash and nothing bound: nothing to do.
      if (!rowMarks && !boundRows.has(tr)) {
        return
      }
      const now = performance.now()
      const rowMark = live(rowMarks?.row, now)
      // The row was bound to this flash in an earlier render: a cell seen
      // only now was mounted since (a column shown), and the row's value,
      // written when the row was bound, is not its time.
      const rowWasBound = rowMark !== null && bound.get(tr) === rowMark.gen
      bindTo(tr, rowMark, now, false)
      const rowValue = written.get(tr) ?? ''
      let any = bound.has(tr)
      const cells = tr.children
      for (let i = 0; i < cells.length; i++) {
        const td = cells[i] as HTMLElement
        const field = td.getAttribute('data-field')
        const own =
          field === null ? null : live(rowMarks?.cells?.get(field), now)
        if (own) {
          bindTo(td, own, now, rowValue !== '')
        } else if (
          rowMark &&
          (bound.get(td) === rowMark.gen ||
            (rowWasBound && seenUnder.get(td) !== rowMark.gen))
        ) {
          // A cell mounted after its row was bound takes the row's flash
          // with its own elapsed time.
          bindTo(td, rowMark, now, false)
        } else {
          // A cell without a flash of its own inherits the row's value.
          bindTo(td, null, now, false)
        }
        if (rowMark) {
          seenUnder.set(td, rowMark.gen)
        }
        any ||= bound.has(td)
      }
      if (any) {
        boundRows.add(tr)
      } else {
        boundRows.delete(tr)
      }
    }
  }

  /** Remove the elapsed times written on the body. */
  const unbindAll = () => {
    const body = o.table.value?.tBodies[0]
    if (!body) {
      return
    }
    const rows = body.children
    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i] as HTMLElement
      tr.style.removeProperty(elapsedProperty)
      const cells = tr.children
      for (let j = 0; j < cells.length; j++) {
        ;(cells[j] as HTMLElement).style.removeProperty(elapsedProperty)
      }
    }
  }

  // On unmount the elements go with the table: only the clock is stopped.
  onScopeDispose(stopClock)

  return {
    view,
    unbind: unbindAll,
    update,
    // KeepAlive: nothing runs while away; back, the rows are a baseline.
    deactivate: () => {
      active = false
      resetAll()
      unbindAll()
    },
    activate: () => {
      active = true
      update()
    }
  }
}

/**
 * The change flash of `QueryTable` (C-93 to C-95). Off, it sets up one
 * watcher that reads `flash` and nothing else: no comparison, timer, frame
 * callback, listener, style read or memory per row. On, the same watcher
 * also reads what the tracker compares, and the flash runs in an effect
 * scope of its own; stopping that scope undoes everything. Nothing runs on
 * the server: the flash starts once the table is mounted.
 */
export const useChangeFlash = <T extends object>(
  o: ChangeFlashOptions<T>
): ShallowRef<FlashView | null> => {
  const view = shallowRef<FlashView | null>(null)
  const instance = getCurrentInstance() as ComponentInternalInstance
  const owner = getCurrentScope() as EffectScope
  let scope: EffectScope | null = null
  let controller: Controller | null = null
  let hooked = false
  let mounted = false

  const start = () => {
    scope = owner.run(() => effectScope())!
    controller = scope.run(() => startFlash(o))!
    view.value = controller.view
    if (!hooked) {
      hooked = true
      onDeactivated(() => controller?.deactivate(), instance)
      onActivated(() => controller?.activate(), instance)
    }
  }
  const stop = () => {
    controller?.unbind()
    scope?.stop()
    scope = null
    controller = null
    view.value = null
  }

  // One watcher, run before the table renders. Off it reads `flash` only.
  watch(
    () =>
      o.flash()
        ? [
            o.flash(),
            o.rows(),
            o.query(),
            o.loading(),
            o.rowsUpdate(),
            o.rowKey(),
            o.fields()
          ]
        : null,
    on => {
      if (!mounted) {
        return
      }
      if (!on) {
        stop()
      } else if (controller) {
        controller.update()
      } else {
        start()
      }
    }
  )
  onMounted(() => {
    mounted = true
    if (o.flash()) {
      start()
    }
  })
  return view
}
