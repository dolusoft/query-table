import { computed, onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'

import {
  groupRuns,
  groupShape,
  type GroupKey,
  type GroupRun
} from '../body/group-runs'
import type { ScrollToIndexOptions, VirtualOptions } from '../contract'
import type { BodyRow } from '../use-query-table'
import {
  computeWindow,
  fillOffsets,
  indexAt,
  segmentsOf,
  type WindowRange
} from './compute-window'

// Replaced by the consumer's bundler, just as in Vue's esm-bundler build.
declare const process: { env: { NODE_ENV?: string } }

// A try/catch keeps the constant replacement in production builds.
const isDevelopment = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production'
  } catch {
    return true
  }
}

/** A row the body draws, with its `aria-rowindex` when the body is virtual. */
export type DrawnRow<T> = BodyRow<T> & { aria?: number }
/** A spacer row: the height of the items it stands for (C-83). */
export interface SpacerRow {
  spacer: number
  key: symbol
}
/** The header row of a group (C-103), with its `aria-rowindex` when virtual. */
export interface GroupRow<T> {
  group: GroupRun<T>
  key: symbol
  aria?: number
}
/** An item of the body: a data row, a spacer or a group row. */
export type BodyItem<T> = DrawnRow<T> | SpacerRow | GroupRow<T>

export interface RowWindowOptions<T> {
  virtual: () => boolean | VirtualOptions | undefined
  table: Readonly<Ref<HTMLTableElement | null>>
  /** The rows in drawing order: pinned top, the others, pinned bottom (C-74). */
  bodyRows: () => BodyRow<T>[]
  keyOf: (row: T, index: number) => string | number
  isExpanded: (row: T, index: number) => boolean
  /** The `groupBy` prop (C-103); absent, no group is drawn. */
  groupBy?: () =>
    ((row: T, index: number) => GroupKey | null | undefined) | undefined
}

type Align = NonNullable<ScrollToIndexOptions['align']>
type Container = HTMLElement | Window

/** One identity per spacer place: above, between, below (`segmentsOf`). */
const spacerKeys = [Symbol('above'), Symbol('between'), Symbol('below')]

/**
 * The virtual body (C-83 to C-87): which rows are drawn, the spacers that
 * stand for the others, the measured heights, the focused row kept drawn,
 * printing and `scrollToIndex`. Without `virtual` it draws `bodyRows` as
 * they are and touches no DOM.
 */
export const useRowWindow = <T extends object>(o: RowWindowOptions<T>) => {
  // Compared by value: `:virtual="{ overscan: 5 }"` is a new object on every
  // render of the consumer and must not draw the body again.
  const settings = computed<VirtualOptions | null>(previous => {
    const value = o.virtual()
    const next = value === true ? {} : value || null
    return previous &&
      next &&
      previous.overscan === next.overscan &&
      previous.rowHeight === next.rowHeight &&
      previous.estimateRowHeight === next.estimateRowHeight &&
      previous.groupRowHeight === next.groupRowHeight &&
      previous.scrollElement === next.scrollElement
      ? previous
      : next
  })
  const enabled = () => settings.value !== null
  const overscan = () => Math.max(0, settings.value?.overscan ?? 10)
  const fixed = () => settings.value?.rowHeight

  /** Pinned rows sit at both ends of `bodyRows`; the window is the middle. */
  const parts = computed(() => {
    const all = o.bodyRows()
    let top = 0
    while (top < all.length && all[top].pinned === 'top') {
      top++
    }
    let bottom = all.length
    while (bottom > top && all[bottom - 1].pinned === 'bottom') {
      bottom--
    }
    return {
      all,
      top,
      center: top === 0 && bottom === all.length ? all : all.slice(top, bottom)
    }
  })
  const center = () => parts.value.center

  /** The groups of the center rows (C-103), or `null` without `groupBy`. */
  const groups = computed(() => {
    const groupBy = o.groupBy?.()
    return groupBy ? groupRuns(center(), groupBy) : null
  })
  /** The center position starts a group: its group row is drawn above it. */
  const startsGroup = (position: number) => {
    const g = groups.value
    if (!g) {
      return false
    }
    const at = g.groupOf[position]
    return at >= 0 && g.runs[at].start === position
  }
  // A symbol per group id: a group row's `v-for` key can never equal a
  // consumer's `rowKey`, whatever string that is. Ids that left are dropped.
  let groupKeys = new Map<string, symbol>()
  watch(groups, g => {
    if (!g) {
      groupKeys = new Map()
      return
    }
    const kept = new Map<string, symbol>()
    for (const run of g.runs) {
      const known = groupKeys.get(run.id)
      if (known) {
        kept.set(run.id, known)
      }
    }
    groupKeys = kept
  })
  const groupKey = (id: string) => {
    let key = groupKeys.get(id)
    if (!key) {
      key = Symbol(id)
      groupKeys.set(id, key)
    }
    return key
  }
  const groupRowOf = (run: GroupRun<T>, aria?: number): GroupRow<T> => ({
    group: run,
    key: groupKey(run.id),
    aria
  })

  /** Position of a row index among the center rows (ascending), or -1. */
  const positionOf = (index: number): number => {
    const rows = center()
    if (rows[index]?.index === index) {
      return index
    }
    let low = 0
    let high = rows.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      const at = rows[mid].index
      if (at === index) {
        return mid
      }
      if (at < index) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return -1
  }

  // ---- heights (C-84) -------------------------------------------------------

  let heights = new Float64Array(0)
  /** Item heights without the group row above an item (C-104). */
  let base = new Float64Array(0)
  let measured = new Uint8Array(0)
  /** The measured height of a group row, `0` until one is measured. */
  let groupMeasured = 0
  let offsets = new Float64Array(1)
  let byKey = new Map<string | number, number>()
  /** The first measured height, the estimate when none is given. */
  let firstMeasured = 0
  /** Bumped whenever `offsets` change, so the spacers are drawn again. */
  const version = shallowRef(0)
  const estimate = () =>
    fixed() ?? settings.value?.estimateRowHeight ?? (firstMeasured || 32)
  /** Height counted for a group row (C-104). */
  const groupHeight = () => {
    const height = fixed()
    if (height !== undefined) {
      return settings.value?.groupRowHeight ?? height
    }
    return groupMeasured || estimate()
  }
  /** An item's height: its row and, above it, its group row. */
  const withGroup = (position: number) =>
    base[position] + (startsGroup(position) ? groupHeight() : 0)

  const rebuild = () => {
    const rows = enabled() ? center() : []
    const height = fixed()
    heights = new Float64Array(rows.length)
    // Without groups an item is its row: one array serves both (P8).
    base = groups.value ? new Float64Array(rows.length) : heights
    measured = new Uint8Array(rows.length)
    const kept = new Map<string | number, number>()
    for (let i = 0; i < rows.length; i++) {
      if (height !== undefined) {
        base[i] = height
      } else {
        const key = o.keyOf(rows[i].row, rows[i].index)
        const known = byKey.get(key)
        if (known === undefined) {
          base[i] = estimate()
        } else {
          kept.set(key, known)
          base[i] = known
          measured[i] = 1
        }
      }
      heights[i] = withGroup(i)
    }
    // Keys that left `rows` are dropped (C-84).
    byKey = kept
    // A `scrollToIndex` waiting for its row meant the rows it was given.
    pending = null
    offsets = new Float64Array(rows.length + 1)
    fillOffsets(heights, offsets)
    version.value++
  }

  const body = () => o.table.value?.tBodies[0] ?? null

  /** The drawn data row at a center position. */
  const rowElement = (tbody: HTMLElement, position: number) => {
    const row = center()[position]
    return row
      ? tbody.querySelector<HTMLElement>(
          `:scope > tr[data-row-index="${row.index}"]:not([data-pinned-row])`
        )
      : null
  }

  /** Height of a drawn item: its row and its subtable row. */
  const itemHeight = (tr: Element) => {
    const next = tr.nextElementSibling
    return (
      tr.getBoundingClientRect().height +
      (next?.classList.contains('qt-subtable-row')
        ? next.getBoundingClientRect().height
        : 0)
    )
  }

  /** Reads the drawn items; `true` when a height changed. */
  const measure = (tbody: HTMLElement): boolean => {
    if (fixed() !== undefined) {
      return false
    }
    const rows = center()
    let from = -1
    for (const tr of tbody.children) {
      if (groups.value && tr.classList.contains('qt-group-row')) {
        // Every group row counts as tall as the last one measured (C-104).
        const height = tr.getBoundingClientRect().height
        if (height > 0 && Math.abs(height - groupMeasured) > 0.5) {
          groupMeasured = height
          from = 0
        }
        continue
      }
      const at = tr.getAttribute('data-row-index')
      if (at === null || tr.hasAttribute('data-pinned-row')) {
        continue
      }
      const position = positionOf(Number(at))
      if (position < 0) {
        continue
      }
      const height = itemHeight(tr)
      if (
        !firstMeasured &&
        height > 0 &&
        settings.value?.estimateRowHeight === undefined
      ) {
        // The first measured item becomes the estimate of the others.
        firstMeasured = height
        for (let i = 0; i < base.length; i++) {
          if (!measured[i]) {
            base[i] = height
          }
        }
        from = 0
      }
      if (!measured[position] || Math.abs(base[position] - height) > 0.5) {
        base[position] = height
        measured[position] = 1
        byKey.set(o.keyOf(rows[position].row, rows[position].index), height)
        from = from < 0 ? position : Math.min(from, position)
      }
    }
    if (from >= 0) {
      for (let i = from; i < heights.length; i++) {
        heights[i] = withGroup(i)
      }
      fillOffsets(heights, offsets, from)
      version.value++
      return true
    }
    return false
  }

  // ---- the window (C-83, C-85) ----------------------------------------------

  const range = shallowRef<WindowRange>({
    start: 0,
    end: Math.ceil((globalThis.innerHeight || 800) / 32) + 10
  })
  /** The window was computed from the layout at least once. */
  const ready = shallowRef(false)
  let container: Container | null = null
  let frame = 0
  /** The first visible item and its top before the window moved (C-84). */
  let anchor: { position: number; top: number } | null = null
  /**
   * The container's scroll position the window was computed for. The
   * browser's own scroll anchoring may move it when the drawn rows change
   * (it anchors to a spacer when no row is in view); it is put back.
   */
  let expected: number | null = null
  /** A `scrollToIndex` to correct once its row is drawn (C-87). */
  let pending: { position: number; align: Align; tries: number } | null = null
  /** Frames a `scrollToIndex` waits for its row before it is given up. */
  const pendingFrames = 6

  const viewport = (target: Container | null = container) => {
    if (target === null || target === window) {
      return { top: 0, height: globalThis.innerHeight }
    }
    const element = target as HTMLElement
    return {
      top: element.getBoundingClientRect().top + element.clientTop,
      height: element.clientHeight
    }
  }

  /** Client top of the first center item: below the top-pinned rows. */
  const itemsTop = (tbody: HTMLElement) => {
    for (const tr of tbody.children) {
      if (tr.getAttribute('data-pinned-row') !== 'top') {
        return tr.getBoundingClientRect().top
      }
    }
    return tbody.getBoundingClientRect().bottom
  }

  const scrollTopOf = (target: Container) =>
    target === window ? window.scrollY : (target as HTMLElement).scrollTop

  // Always instant: with `scroll-behavior: smooth` on the container (or on
  // the root, for the window) a plain assignment animates, the position
  // read right after is the old one and the corrections land wrong.
  const scrollBy = (delta: number, target: Container | null = container) => {
    if (Math.abs(delta) < 1 || !target) {
      return
    }
    target.scrollTo({
      top: scrollTopOf(target) + delta,
      behavior: 'instant'
    })
  }

  /** How far to scroll to show an item at `top` (client) with `height`. */
  const alignDelta = (
    top: number,
    height: number,
    align: Align,
    groupCover = 0,
    target: Container | null = container
  ) => {
    const view = viewport(target)
    // A sticky header that covers the top of the container hides a row
    // aligned to the top; the row goes below it, and below a sticky group
    // row that covers it too (C-104).
    const head = o.table.value?.tHead?.getBoundingClientRect()
    const cover =
      head && head.top <= view.top + 1 && head.bottom > view.top
        ? head.bottom - view.top
        : 0
    const viewTop = view.top + cover + groupCover
    const viewBottom = view.top + view.height
    const bottom = top + height
    switch (align) {
      case 'start':
        return top - viewTop
      case 'end':
        return bottom - viewBottom
      case 'center':
        return (top + bottom - viewTop - viewBottom) / 2
      default:
        return top < viewTop
          ? top - viewTop
          : bottom > viewBottom
            ? bottom - viewBottom
            : 0
    }
  }

  /**
   * Height of a group row the consumer's CSS made sticky, which covers a
   * row aligned to the top of its group (C-104); `0` without one.
   */
  const stickyGroupCover = (tbody: HTMLElement) => {
    if (!groups.value) {
      return 0
    }
    // Sticky on the cell only: the window reads the row's place in the flow.
    const cell = tbody.querySelector(':scope > tr.qt-group-row > th')
    return cell && getComputedStyle(cell).position === 'sticky'
      ? cell.getBoundingClientRect().height
      : 0
  }
  /** The sticky cover over a row: only a grouped row that does not start its group. */
  const coverOf = (position: number, tbody: HTMLElement) => {
    const g = groups.value
    return g && g.groupOf[position] >= 0 && !startsGroup(position)
      ? stickyGroupCover(tbody)
      : 0
  }

  /**
   * Scrolls `target` so the drawn row `tr` (at a center position, or `-1`
   * for a pinned row) is shown as `align` asks, below a sticky header and a
   * sticky group row (C-87, C-104).
   */
  const alignRow = (
    tbody: HTMLElement,
    tr: Element,
    position: number,
    align: Align,
    target: Container | null,
    /** The item with its open subtable row, or the row alone. */
    whole = true
  ) => {
    // The first row of a group is shown with its group row above it.
    const above = startsGroup(position) ? tr.previousElementSibling : null
    const head = above?.classList.contains('qt-group-row') ? above : null
    scrollBy(
      alignDelta(
        (head ?? tr).getBoundingClientRect().top,
        (whole ? itemHeight(tr) : tr.getBoundingClientRect().height) +
          (head ? head.getBoundingClientRect().height : 0),
        align,
        head ? 0 : coverOf(position, tbody),
        target
      ),
      target
    )
  }

  /** After a render: correct the drift (C-84) or a `scrollToIndex` (C-87). */
  const settle = () => {
    const tbody = body()
    if (!tbody) {
      return
    }
    if (expected !== null && container) {
      // Reading the position lays the page out, the browser's anchoring
      // adjustment included; undo it, the corrections below are ours.
      scrollBy(expected - scrollTopOf(container))
      expected = null
    }
    if (pending) {
      const tr = rowElement(tbody, pending.position)
      if (tr) {
        const { align, position } = pending
        pending = null
        alignRow(tbody, tr, position, align, container)
        return
      }
      // Its row never got drawn (the container could not scroll that far,
      // say): give up, so the drift correction works again.
      if (++pending.tries <= pendingFrames) {
        schedule()
        return
      }
      pending = null
    }
    if (anchor) {
      const tr = rowElement(tbody, anchor.position)
      if (tr) {
        scrollBy(tr.getBoundingClientRect().top - anchor.top)
      }
      anchor = null
    }
  }

  const update = () => {
    frame = 0
    const tbody = body()
    if (!tbody || !container || printing.value) {
      return
    }
    measure(tbody)
    const view = viewport()
    const scrollTop = view.top - itemsTop(tbody)
    const next = computeWindow({
      offsets,
      scrollTop,
      viewportHeight: view.height,
      overscan: overscan()
    })
    ready.value = true
    const current = range.value
    if (next.start === current.start && next.end === current.end) {
      settle()
      return
    }
    if (!pending && fixed() === undefined) {
      // The item at the top of the view, or the nearest drawn one when a
      // fast scroll went past the drawn rows: the anchor must be drawn now.
      const position = Math.min(
        Math.max(indexAt(offsets, scrollTop), current.start),
        current.end - 1
      )
      const tr = position < 0 ? null : rowElement(tbody, position)
      anchor = tr ? { position, top: tr.getBoundingClientRect().top } : null
    }
    expected = scrollTopOf(container)
    range.value = next
  }

  const schedule = () => {
    if (!frame) {
      frame = requestAnimationFrame(update)
    }
  }

  // ---- printing (C-87) ------------------------------------------------------

  const printing = shallowRef(false)
  const startPrint = () => {
    printing.value = true
  }
  const endPrint = () => {
    printing.value = false
    schedule()
  }
  const onPrintMedia = (event: MediaQueryListEvent) => {
    if (event.matches) {
      startPrint()
    } else {
      endPrint()
    }
  }
  let printMedia: MediaQueryList | null = null

  // ---- focus (C-86) ---------------------------------------------------------

  const kept = shallowRef<{ row: T; position: number } | null>(null)

  /** The row index of the item (data row or subtable row) holding `target`. */
  const itemOf = (target: EventTarget | null, tbody: Element) => {
    let tr = (target as Element | null)?.closest?.('tr') ?? null
    while (tr && tr.parentElement !== tbody) {
      tr = tr.parentElement?.closest('tr') ?? null
    }
    if (tr?.classList.contains('qt-subtable-row')) {
      tr = tr.previousElementSibling as HTMLTableRowElement | null
    }
    const at = tr?.getAttribute('data-row-index')
    return !tr ||
      at === null ||
      at === undefined ||
      tr.hasAttribute('data-pinned-row')
      ? -1
      : positionOf(Number(at))
  }

  const onFocusIn = (event: FocusEvent) => {
    if (!enabled()) {
      return
    }
    const position = itemOf(event.target, event.currentTarget as Element)
    if (position >= 0) {
      kept.value = { row: center()[position].row, position }
    }
  }

  const onFocusOut = (event: FocusEvent) => {
    if (
      kept.value &&
      itemOf(event.relatedTarget, event.currentTarget as Element) !==
        kept.value.position
    ) {
      kept.value = null
    }
  }

  const keptPosition = () => {
    const focus = kept.value
    if (!focus) {
      return null
    }
    const rows = center()
    if (rows[focus.position]?.row === focus.row) {
      return focus.position
    }
    const found = rows.findIndex(row => row.row === focus.row)
    return found < 0 ? null : found
  }

  // ---- the drawn rows -------------------------------------------------------

  /** Open subtable rows before each row of `bodyRows`, and in all (C-86). */
  const expandedBefore = computed(() => {
    const all = enabled() ? parts.value.all : []
    const counts = new Int32Array(all.length + 1)
    for (let i = 0; i < all.length; i++) {
      counts[i + 1] =
        counts[i] + (o.isExpanded(all[i].row, all[i].index) ? 1 : 0)
    }
    return counts
  })

  /** Group rows drawn up to and with the center position (C-104). */
  const groupsThrough = (position: number) =>
    groups.value ? groups.value.headersThrough[position] : 0
  const groupCount = () => groups.value?.runs.length ?? 0

  const drawn = computed<Array<BodyItem<T>>>(() => {
    const { all, top } = parts.value
    const g = groups.value
    if (!enabled()) {
      if (!g) {
        return all
      }
      // Without `virtual` every group row is drawn above its first row.
      const out: Array<BodyItem<T>> = []
      for (let q = 0; q < all.length; q++) {
        const p = q - top
        if (p >= 0 && p < g.groupOf.length && startsGroup(p)) {
          out.push(groupRowOf(g.runs[g.groupOf[p]]))
        }
        out.push(all[q])
      }
      return out
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    version.value
    const rows = center()
    const before = expandedBefore.value
    // The header row is 1, the first body row 2; a group row counts as a
    // row, before the first row of its group (C-104).
    const headersBefore = (q: number) =>
      q < top
        ? 0
        : q < top + rows.length
          ? groupsThrough(q - top)
          : groupCount()
    const ariaOf = (q: number) => q + before[q] + headersBefore(q) + 2
    const at = (q: number): DrawnRow<T> => ({ ...all[q], aria: ariaOf(q) })
    const out: Array<BodyItem<T>> = []
    /** The group whose row was drawn last, or -1. */
    let drawnGroup = -1
    /** The center row at `p`, after its group row when it needs one. */
    const push = (p: number, carry: boolean) => {
      const group = g ? g.groupOf[p] : -1
      if (g && group >= 0 && group !== drawnGroup) {
        const run = g.runs[group]
        if (run.start === p) {
          out.push(groupRowOf(run, ariaOf(top + p) - 1))
        } else if (carry) {
          // The first row of the group is not drawn: its group row is drawn
          // here, with its height taken from the spacer above, so a sticky
          // group row stays while its group is in view (C-104).
          const last = out[out.length - 1]
          if (last && 'spacer' in last) {
            const height = Math.max(0, last.spacer - groupHeight())
            out[out.length - 1] = { spacer: height, key: last.key }
          }
          out.push(groupRowOf(run, ariaOf(top + run.start) - 1))
        }
      }
      drawnGroup = group
      out.push(at(top + p))
    }
    for (let q = 0; q < top; q++) {
      out.push(at(q))
    }
    if (printing.value) {
      for (let p = 0; p < rows.length; p++) {
        push(p, false)
      }
    } else {
      const end = Math.min(range.value.end, rows.length)
      const win = { start: Math.min(range.value.start, end), end }
      for (const segment of segmentsOf(offsets, win, keptPosition())) {
        if ('spacer' in segment) {
          out.push({ spacer: segment.spacer, key: spacerKeys[segment.slot] })
        } else {
          for (let p = segment.from; p < segment.to; p++) {
            push(p, p === segment.from)
          }
        }
      }
    }
    for (let q = top + rows.length; q < all.length; q++) {
      out.push(at(q))
    }
    // A spacer whose height went to a group row is not drawn.
    return g ? out.filter(item => !('spacer' in item) || item.spacer > 0) : out
  })

  // ---- the container and its listeners (C-85) -------------------------------

  let box: ResizeObserver | null = null
  let rowsObserver: ResizeObserver | null = null
  /**
   * Watches the table for coming into the layout: a table mounted inside
   * `display: none` has no scrolling ancestor yet, so the container is
   * looked for again once it has a size.
   */
  let shown: ResizeObserver | null = null
  let hadSize = false
  let watchedTable: HTMLTableElement | null = null
  const watchShown = (table: HTMLTableElement | null) => {
    if (table === watchedTable) {
      return
    }
    shown?.disconnect()
    shown = null
    watchedTable = table
    if (!table || typeof ResizeObserver === 'undefined') {
      return
    }
    hadSize = table.getBoundingClientRect().height > 0
    shown = new ResizeObserver(() => {
      const hasSize = table.getBoundingClientRect().height > 0
      if (hasSize !== hadSize) {
        hadSize = hasSize
        if (hasSize) {
          attach()
        }
      }
    })
    shown.observe(table)
  }
  const observed = new Set<Element>()
  let warned = false

  const findContainer = (table: HTMLTableElement): Container => {
    const given = settings.value?.scrollElement?.()
    if (given) {
      return given
    }
    for (
      let element = table.parentElement;
      element &&
      element !== document.body &&
      element !== document.documentElement;
      element = element.parentElement
    ) {
      const overflow = getComputedStyle(element).overflowY
      if (
        (overflow === 'auto' || overflow === 'scroll') &&
        element.scrollHeight > element.clientHeight
      ) {
        return element
      }
    }
    return window
  }

  const detach = () => {
    container?.removeEventListener('scroll', schedule)
    container = null
    box?.disconnect()
    box = null
    removeEventListener('resize', schedule)
  }

  const attach = () => {
    const table = o.table.value
    if (!table || !enabled()) {
      watchShown(null)
      detach()
      return
    }
    watchShown(table)
    const next = findContainer(table)
    if (next !== container) {
      detach()
      container = next
      next.addEventListener('scroll', schedule, { passive: true })
      addEventListener('resize', schedule)
      if (next !== window && typeof ResizeObserver !== 'undefined') {
        box = new ResizeObserver(schedule)
        box.observe(next as HTMLElement)
      }
    }
    if (
      !warned &&
      isDevelopment() &&
      getComputedStyle(table).tableLayout !== 'fixed'
    ) {
      warned = true
      console.warn(
        '[QueryTable] `virtual` with `table-layout: auto`: column widths follow the drawn rows. Set `table-layout: fixed` (C-85).'
      )
    }
    schedule()
  }

  /** Watches the drawn rows for size changes; measured on the next frame. */
  const observeRows = () => {
    const tbody = body()
    if (
      !tbody ||
      !enabled() ||
      fixed() !== undefined ||
      typeof ResizeObserver === 'undefined'
    ) {
      rowsObserver?.disconnect()
      observed.clear()
      return
    }
    rowsObserver ??= new ResizeObserver(schedule)
    for (const element of observed) {
      if (element.parentElement !== tbody) {
        rowsObserver.unobserve(element)
        observed.delete(element)
      }
    }
    for (const tr of tbody.children) {
      if (!observed.has(tr) && !tr.classList.contains('qt-virtual-spacer')) {
        rowsObserver.observe(tr)
        observed.add(tr)
      }
    }
  }

  watch(
    [
      () => parts.value.center,
      () => settings.value?.rowHeight,
      () => settings.value?.estimateRowHeight,
      () => settings.value?.groupRowHeight,
      // By shape, not identity: a `groupBy` given anew on each render with
      // the same runs does not rebuild the heights.
      () => groupShape(groups.value),
      enabled
    ],
    rebuild,
    { immediate: true }
  )

  // The container is looked for again when the rows change: a container
  // only scrolls once its content is taller than it.
  watch(
    [
      () => o.table.value,
      enabled,
      () => settings.value?.scrollElement,
      () => parts.value.center
    ],
    attach,
    { flush: 'post', immediate: true }
  )

  watch(
    drawn,
    () => {
      observeRows()
      settle()
    },
    { flush: 'post' }
  )

  watch(
    enabled,
    on => {
      printMedia?.removeEventListener('change', onPrintMedia)
      removeEventListener('beforeprint', startPrint)
      removeEventListener('afterprint', endPrint)
      printMedia = null
      if (on && typeof window !== 'undefined') {
        addEventListener('beforeprint', startPrint)
        addEventListener('afterprint', endPrint)
        printMedia = window.matchMedia?.('print') ?? null
        printMedia?.addEventListener('change', onPrintMedia)
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    detach()
    watchShown(null)
    cancelAnimationFrame(frame)
    rowsObserver?.disconnect()
    printMedia?.removeEventListener('change', onPrintMedia)
    removeEventListener('beforeprint', startPrint)
    removeEventListener('afterprint', endPrint)
  })

  // ---- scrollToIndex (C-87) -------------------------------------------------

  const scrollToIndex = (index: number, options: ScrollToIndexOptions = {}) => {
    const align = options.align ?? 'auto'
    const tbody = body()
    if (!tbody || !Number.isInteger(index) || index < 0) {
      return
    }
    const position =
      enabled() && container && !printing.value ? positionOf(index) : -1
    if (position < 0) {
      tbody
        .querySelector(`:scope > tr[data-row-index="${index}"]`)
        ?.scrollIntoView({
          block: align === 'auto' ? 'nearest' : align,
          behavior: 'instant'
        })
      return
    }
    anchor = null
    pending = { position, align, tries: 0 }
    scrollBy(
      alignDelta(
        itemsTop(tbody) + offsets[position],
        heights[position],
        align,
        coverOf(position, tbody)
      )
    )
    schedule()
  }

  /**
   * Shows the drawn row with this index in `rows` whole, below a sticky
   * header and a sticky group row, in its scroll container (C-110); with
   * `virtual` that is the container of C-85, else the nearest scrolling
   * ancestor of the table or the window. Only the row: an open subtable row
   * taller than the view would push it out. A `scrollToIndex` still waiting
   * is dropped, so it cannot move the view away after. A row not drawn does
   * nothing.
   */
  const reveal = (index: number) => {
    const tbody = body()
    const table = o.table.value
    const tr = tbody?.querySelector(`:scope > tr[data-row-index="${index}"]`)
    if (!tbody || !table || !tr) {
      return
    }
    pending = null
    const target = enabled() && container ? container : findContainer(table)
    alignRow(
      tbody,
      tr,
      tr.hasAttribute('data-pinned-row') ? -1 : positionOf(index),
      'auto',
      target,
      false
    )
  }

  return {
    enabled,
    drawn,
    range,
    ready,
    centerCount: () => center().length,
    expandedCount: () => expandedBefore.value[expandedBefore.value.length - 1],
    /** Group rows of the body, drawn or not (C-104). */
    groupCount,
    scrollToIndex,
    reveal,
    /** A `scrollToIndex` or a window update is still to come (C-110). */
    busy: () => pending !== null || frame !== 0,
    onFocusIn,
    onFocusOut
  }
}
