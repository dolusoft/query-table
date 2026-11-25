import { onBeforeUnmount, shallowRef, watch, watchEffect, type Ref } from 'vue'

import type { RowReorderPayload, ScrollToIndexOptions } from '../contract'
import type { BodyRow } from '../use-query-table'

// Replaced by the consumer's bundler, just as in Vue's esm-bundler build.
declare const process: { env: { NODE_ENV?: string } }

export interface RowReorderOptions<T> {
  /** The `rowReorderable` prop. */
  rowReorderable: () => boolean
  /** `rowKey` is given: without it there is no handle (C-133). */
  hasRowKey: () => boolean
  /** The table of the body rows: drop targets and refocus look at its own body. */
  table: Readonly<Ref<HTMLTableElement | null>>
  /** The `rows` prop: a written-back order gives the focus back. */
  rows: () => unknown
  /** The rows in drawing order: pinned top, the others, pinned bottom (C-74). */
  bodyRows: () => BodyRow<T>[]
  keyOf: (row: T, index: number) => string | number
  /** The body is virtual: a moved row may be out of the window (C-83). */
  virtual: () => boolean
  scrollToIndex: (index: number, options?: ScrollToIndexOptions) => void
  /** Shows a drawn row whole in its scroll container, as C-110 does. */
  reveal: (index: number) => void
  /** The rows the body draws: the window drew the moved row. */
  drawn: () => unknown
  onMove: (payload: RowReorderPayload<T>) => void
}

/** What the body shows while a row is dragged (C-133). */
export interface RowDrag {
  key: string | number
  /** The key of the row it would go next to, if any. */
  target: string | number | null
  place: 'before' | 'after'
}

/** The listeners of one row's handle, made once per row. */
export interface RowHandleListeners {
  onPointerdown: (event: PointerEvent) => void
  onKeydown: (event: KeyboardEvent) => void
  onBlur: (event: FocusEvent) => void
}

interface Drag {
  key: string | number
  pointerId: number
  /** Where the handle was pressed: the rows are found under this `x`. */
  x: number
  handle: HTMLElement
}

/** The class of a row's handle; the row navigation leaves it out (C-109). */
export const rowHandleClass = 'qt-row-reorder-handle'

const keys = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End'])

/**
 * Reordering a row with its handle (C-133): a pointer drag or ↑, ↓, Home
 * and End among the rows that are not pinned. The table keeps only the drag
 * in progress; the move goes out as `rowReorder` and comes back, if the
 * consumer wants it, as the order of `rows`. While a row is dragged the
 * window listens, so a drag goes on when a virtual body unmounts the row.
 */
export const useRowReorder = <T>(o: RowReorderOptions<T>) => {
  const enabled = () => o.rowReorderable() && o.hasRowKey()
  const dragging = shallowRef<RowDrag | null>(null)
  let drag: Drag | null = null
  /** The row whose handle moved it by key and should keep the focus. */
  let refocus: string | number | null = null
  /** A key moved the row: the next written-back order shows it. */
  let show = false
  /** Between the new `rows` and their render: a blur then is the move's. */
  let patching = false

  const body = () => o.table.value?.tBodies[0] ?? null
  const keyOf = (item: BodyRow<T>) => o.keyOf(item.row, item.index)
  /** The rows a handle moves among: the ones not pinned, in `rows` order. */
  const region = () => o.bodyRows().filter(item => !item.pinned)

  /** Emits the move, unless a row is gone or the order stays. */
  const move = (
    key: string | number,
    target: string | number,
    place: 'before' | 'after'
  ) => {
    const rows = region()
    const from = rows.findIndex(item => keyOf(item) === key)
    const to = rows.findIndex(item => keyOf(item) === target)
    if (
      from < 0 ||
      to < 0 ||
      to === from ||
      (place === 'after' && to === from - 1) ||
      (place === 'before' && to === from + 1)
    ) {
      return
    }
    const { row, index } = rows[from]
    o.onMove({ row, rowIndex: index, rowKey: key, target, place })
  }

  /** The row under the pointer and its half, or `null` (C-133). */
  const targetAt = (x: number, y: number) => {
    const tbody = body()
    let tr = tbody
      ? (document.elementFromPoint(x, y)?.closest('tr') ?? null)
      : null
    while (tr && tr.parentElement !== tbody) {
      tr = tr.parentElement?.closest('tr') ?? null
    }
    if (!tr) {
      return null
    }
    let place: 'before' | 'after' = 'after'
    if (tr.classList.contains('qt-subtable-row')) {
      // An open row's subtable is its own: dropping on it places after it.
      tr = tr.previousElementSibling as HTMLTableRowElement | null
    } else {
      const box = tr.getBoundingClientRect()
      place = y < box.top + box.height / 2 ? 'before' : 'after'
    }
    const index = tr?.getAttribute('data-row-index') ?? null
    const item =
      index === null
        ? undefined
        : region().find(candidate => candidate.index === Number(index))
    return item ? { key: keyOf(item), place } : null
  }

  const onWindowPointer = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return
    }
    if (event.type === 'pointermove') {
      const over = targetAt(drag.x, event.clientY)
      const target = over && over.key !== drag.key ? over.key : null
      const place = over?.place ?? 'after'
      const current = dragging.value
      if (current?.target !== target || current.place !== place) {
        dragging.value = { key: drag.key, target, place }
      }
      return
    }
    // pointerup places the row; pointercancel cancels.
    const done = dragging.value
    end()
    if (event.type === 'pointerup' && done && done.target !== null) {
      move(done.key, done.target, done.place)
    }
  }

  const onWindowKey = (event: KeyboardEvent) => {
    if (drag && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      end()
    }
  }

  /** A capture lost by the handle itself: its row is still drawn. */
  const onLost = () => {
    if (drag?.handle.isConnected) {
      end()
    }
  }

  const listen = (on: boolean) => {
    const method = on ? addEventListener : removeEventListener
    for (const type of ['pointermove', 'pointerup', 'pointercancel']) {
      method(type, onWindowPointer as EventListener, true)
    }
    method('keydown', onWindowKey as EventListener, true)
  }

  function end() {
    if (drag) {
      drag.handle.removeEventListener('lostpointercapture', onLost)
      listen(false)
    }
    drag = null
    dragging.value = null
  }

  /** Ends a refocus: the user clicked or moved the focus elsewhere. */
  function forget() {
    refocus = null
    show = false
    removeEventListener('pointerdown', forget, true)
  }

  const onPointerDown = (event: PointerEvent, key: string | number) => {
    if (event.button !== 0 || drag) {
      return
    }
    const handle = event.currentTarget as HTMLElement
    // No text selection while dragging; the handle takes the focus itself.
    event.preventDefault()
    handle.focus({ preventScroll: true })
    forget()
    drag = { key, pointerId: event.pointerId, x: event.clientX, handle }
    try {
      handle.setPointerCapture(event.pointerId)
    } catch {
      // A pointer the browser does not know: the window still listens.
    }
    handle.addEventListener('lostpointercapture', onLost)
    listen(true)
    dragging.value = { key, target: null, place: 'after' }
  }

  const onKeyDown = (event: KeyboardEvent, key: string | number) => {
    // Alt+Arrow, Ctrl+Home and the like keep their browser meaning.
    if (
      drag ||
      !keys.has(event.key) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return
    }
    // The keys are the handle's: no scroll, and no row navigation (C-109).
    event.preventDefault()
    const rows = region()
    const at = rows.findIndex(item => keyOf(item) === key)
    const to =
      event.key === 'ArrowUp'
        ? at - 1
        : event.key === 'ArrowDown'
          ? at + 1
          : event.key === 'Home'
            ? 0
            : rows.length - 1
    if (at < 0 || to < 0 || to >= rows.length || to === at) {
      return
    }
    // A click anywhere, the handle included, ends the refocus.
    refocus = key
    show = true
    addEventListener('pointerdown', forget, true)
    const up = event.key === 'ArrowUp' || event.key === 'Home'
    move(key, keyOf(rows[to]), up ? 'before' : 'after')
  }

  /**
   * Gives the focus back to the handle of the row moved by key, once it is
   * drawn: with `virtual` the window scrolls to it first (C-87). Only while
   * the focus is nowhere: the move dropped it, nothing else took it. The
   * first order written back after the key shows the row (C-110).
   */
  const land = (scroll: boolean, shown = false) => {
    const key = refocus
    if (key === null) {
      return
    }
    const item = region().find(candidate => keyOf(candidate) === key)
    if (!item || !enabled()) {
      forget()
      return
    }
    const handle = body()?.querySelector<HTMLElement>(
      `:scope > tr[data-row-index="${item.index}"] > td > .${rowHandleClass}`
    )
    if (handle) {
      const active = document.activeElement
      if (!active || active === document.body || !active.isConnected) {
        handle.focus({ preventScroll: true })
      }
      if (shown) {
        o.reveal(item.index)
      }
      return
    }
    if (scroll && o.virtual()) {
      o.scrollToIndex(item.index, { align: 'auto' })
    }
  }

  watch(o.rows, () => {
    patching = true
  })
  watch(
    o.rows,
    () => {
      patching = false
      const shown = show
      show = false
      land(true, shown)
    },
    { flush: 'post' }
  )
  watch(
    o.drawn,
    () => {
      land(false)
    },
    { flush: 'post' }
  )

  let warned = false
  watchEffect(() => {
    if (!warned && o.rowReorderable() && !o.hasRowKey()) {
      warned = true
      try {
        if (process.env.NODE_ENV === 'production') {
          return
        }
      } catch {
        // No `process`: a development build.
      }
      // oxlint-disable-next-line no-console -- development-only warning to the library user
      console.warn(
        '[QueryTable] `rowReorderable` needs `rowKey`; it is ignored without one (C-133).'
      )
    }
  })

  onBeforeUnmount(() => {
    end()
    forget()
  })

  /**
   * The listeners of one row's handle, made once per row; `key` reads the
   * row's current key.
   */
  const listeners = (key: () => string | number): RowHandleListeners => ({
    onPointerdown: event => {
      onPointerDown(event, key())
    },
    onKeydown: event => {
      onKeyDown(event, key())
    },
    // The user moved the focus elsewhere: nothing to give back. A blur while
    // the moved row renders, or to nowhere (a row of a virtual body leaving
    // the window), is the move's.
    onBlur: event => {
      if (!patching && event.relatedTarget !== null) {
        forget()
      }
    }
  })

  return { enabled, dragging, listeners }
}

export type RowReorder = ReturnType<typeof useRowReorder>
