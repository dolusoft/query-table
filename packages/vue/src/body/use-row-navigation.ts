import { computed, onBeforeUnmount, type Ref } from 'vue'

import type {
  RowFocusPayload,
  RowNavigationOptions,
  ScrollToIndexOptions
} from '../contract'
import type { BodyRow } from '../use-query-table'

type NavigationKey = RowFocusPayload<object>['key']

export interface UseRowNavigationOptions<T extends object> {
  rowNavigation: () => boolean | RowNavigationOptions<T> | undefined
  /** The body table: its first `tbody` holds the rows. */
  table: Readonly<Ref<HTMLTableElement | null>>
  /** The rows in drawing order: pinned top, the others, pinned bottom (C-74). */
  bodyRows: () => BodyRow<T>[]
  keyOf: (row: T, index: number) => string | number
  /**
   * `rowKey` is given: a move finds its row by key. Without it the key is
   * the index, so the row is found by its object instead (as C-86 does).
   */
  hasRowKey: () => boolean
  /** The body is virtual (C-83): a row out of the window is not drawn. */
  virtual: () => boolean
  scrollToIndex: (index: number, options?: ScrollToIndexOptions) => void
  /** Shows a drawn row whole, below the sticky covers (C-110). */
  reveal: (index: number) => void
  /** The window still has a scroll or a render to do (C-110). */
  busy: () => boolean
  onFocus: (payload: RowFocusPayload<T>) => void
}

/**
 * The first focusable element of a row, when no `focus` selector is given.
 * Controls that use the arrow keys themselves (text fields, `select`, radio
 * buttons, editable content) are left out: they keep their keys (C-109).
 */
const focusable = [
  'a[href]',
  'button:not([disabled])',
  'input[type="checkbox"]:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not(input, select, textarea, [contenteditable])'
].join(', ')

const keys = new Set<string>(['ArrowUp', 'ArrowDown', 'Home', 'End'])

/** Frames a move waits for its row to be drawn and to keep the focus. */
const maxFrames = 30
/** Frames the focus must stay on the target before a move is done. */
const keepFrames = 2

interface Move {
  /** The key of the row the focus goes to. */
  key: string | number
  /** Its row object: the identity when there is no `rowKey`. */
  row: object
  /** The key the user pressed, for `rowFocus`. */
  pressed: NavigationKey
  /** The element that had the focus when the key was pressed. */
  origin: Element
  /** The focus target the move put the focus on, once it did. */
  landed: HTMLElement | null
  frames: number
  kept: number
}

/**
 * Keyboard navigation between the data rows (C-109 to C-111): one `keydown`
 * listener on the `tbody`, only while `rowNavigation` is on. A move goes by
 * the row's key, not its index: the rows may change while a virtual body
 * draws the row (C-110), and the focus is put back when moving DOM nodes
 * drops it.
 */
export const useRowNavigation = <T extends object>(
  o: UseRowNavigationOptions<T>
) => {
  const settings = computed<RowNavigationOptions<T> | null>(() => {
    const value = o.rowNavigation()
    return value === true ? {} : value || null
  })
  const enabled = () => settings.value !== null

  const body = () => o.table.value?.tBodies[0] ?? null

  /** The focus target of a drawn row, or `null`. */
  const targetOf = (tr: Element) =>
    tr.querySelector<HTMLElement>(settings.value?.focus ?? focusable)

  /** The data row of the body that holds `element`, or `null`. */
  const rowOf = (element: Element | null, tbody: Element) => {
    let tr = element?.closest?.('tr') ?? null
    while (tr && tr.parentElement !== tbody) {
      tr = tr.parentElement?.closest('tr') ?? null
    }
    return tr?.hasAttribute('data-row-index') ? tr : null
  }

  /** Position in drawing order of the move's row, or -1. */
  const positionOf = (rows: BodyRow<T>[], m: Move) =>
    o.hasRowKey()
      ? rows.findIndex(item => o.keyOf(item.row, item.index) === m.key)
      : rows.findIndex(item => item.row === m.row)

  /** The next stop from `from` for `key`: a row `skip` does not name. */
  const stopFrom = (rows: BodyRow<T>[], from: number, key: string) => {
    const skip = settings.value?.skip
    const stop = (p: number) => !skip || !skip(rows[p].row, rows[p].index)
    const step = key === 'ArrowUp' || key === 'End' ? -1 : 1
    let p = key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : from + step
    while (p >= 0 && p < rows.length && !stop(p)) {
      p += step
    }
    return p >= 0 && p < rows.length ? p : -1
  }

  let move: Move | null = null
  let frame = 0

  const stop = () => {
    move = null
    cancelAnimationFrame(frame)
    frame = 0
    removeEventListener('pointerdown', stop, true)
  }

  const again = () => {
    if (!frame) {
      frame = requestAnimationFrame(tick)
    }
  }

  /**
   * The focus is where the move left it, or nowhere: a click or a script
   * that moved it elsewhere ends the move.
   */
  const free = (m: Move) => {
    const active = document.activeElement
    return (
      !active ||
      active === document.body ||
      active === m.origin ||
      active === m.landed ||
      !active.isConnected
    )
  }

  /**
   * Puts the focus on the move's row; `true` when it has it. A row of a
   * virtual body that is not drawn is scrolled to (C-110): again when the
   * window dropped the scroll because `rows` changed (C-87), and right away
   * with `scroll`.
   */
  const land = (m: Move, scroll = false): boolean => {
    const tbody = body()
    const rows = o.bodyRows()
    const p = positionOf(rows, m)
    if (!tbody || p < 0) {
      stop()
      return false
    }
    const { index, pinned } = rows[p]
    const tr = tbody.querySelector(`:scope > tr[data-row-index="${index}"]`)
    if (!tr) {
      if (o.virtual() && !pinned && (scroll || !o.busy())) {
        o.scrollToIndex(index, { align: 'auto' })
      }
      return false
    }
    const target = targetOf(tr)
    if (!target) {
      // A row with no focus target: the move ends where it is (C-109).
      stop()
      return false
    }
    // The table scrolls the row in itself, below the sticky covers.
    target.focus({ preventScroll: true })
    if (document.activeElement !== target) {
      return false
    }
    const first = m.landed === null
    m.landed = target
    if (first) {
      o.reveal(index)
      o.onFocus({ row: rows[p].row, rowIndex: index, key: m.pressed })
    }
    return true
  }

  function tick() {
    frame = 0
    const m = move
    if (!m) {
      return
    }
    if (++m.frames > maxFrames || !free(m)) {
      stop()
      return
    }
    if (m.landed && document.activeElement === m.landed) {
      // Moving DOM nodes can drop the focus (Chrome): it is watched for a
      // few frames after it landed, counted while the window is idle (the
      // scroll of `reveal` makes it draw again), and put back (C-110).
      if (!o.busy() && ++m.kept >= keepFrames) {
        stop()
        return
      }
      again()
      return
    }
    if (!o.busy()) {
      land(m)
    }
    if (move) {
      again()
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (
      !enabled() ||
      !keys.has(event.key) ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return
    }
    const tbody = event.currentTarget as Element
    const target = event.target as Element | null
    // A move still waiting for its row: the key moves on from that row.
    const waiting = move && !move.landed && target === move.origin ? move : null
    const tr = rowOf(target, tbody)
    if (!waiting && (!tr || targetOf(tr) !== target)) {
      return
    }
    const rows = o.bodyRows()
    const from = waiting
      ? positionOf(rows, waiting)
      : rows.findIndex(
          item => item.index === Number(tr!.getAttribute('data-row-index'))
        )
    if (from < 0) {
      return
    }
    event.preventDefault()
    const to = stopFrom(rows, from, event.key)
    if (to < 0 || to === from) {
      return
    }
    stop()
    const { row, index } = rows[to]
    const m: Move = {
      key: o.keyOf(row, index),
      row,
      pressed: event.key as NavigationKey,
      origin: waiting ? waiting.origin : target!,
      landed: null,
      frames: 0,
      kept: 0
    }
    move = m
    // A click anywhere, the origin included, ends the move (C-110).
    addEventListener('pointerdown', stop, true)
    land(m, true)
    if (move) {
      again()
    }
  }

  onBeforeUnmount(stop)

  return { enabled, onKeyDown }
}
