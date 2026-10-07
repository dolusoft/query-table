import {
  computed,
  onBeforeUnmount,
  shallowRef,
  watch,
  type ShallowRef
} from 'vue'

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

export interface RowWindowOptions<T> {
  virtual: () => boolean | VirtualOptions | undefined
  table: ShallowRef<HTMLTableElement | null>
  /** The rows in drawing order: pinned top, the others, pinned bottom (C-74). */
  bodyRows: () => BodyRow<T>[]
  keyOf: (row: T, index: number) => string | number
  isExpanded: (row: T, index: number) => boolean
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
  let measured = new Uint8Array(0)
  let offsets = new Float64Array(1)
  let byKey = new Map<string | number, number>()
  /** The first measured height, the estimate when none is given. */
  let firstMeasured = 0
  /** Bumped whenever `offsets` change, so the spacers are drawn again. */
  const version = shallowRef(0)
  const estimate = () =>
    fixed() ?? settings.value?.estimateRowHeight ?? (firstMeasured || 32)

  const rebuild = () => {
    const rows = enabled() ? center() : []
    const height = fixed()
    heights = new Float64Array(rows.length)
    measured = new Uint8Array(rows.length)
    const kept = new Map<string | number, number>()
    for (let i = 0; i < rows.length; i++) {
      if (height !== undefined) {
        heights[i] = height
        continue
      }
      const key = o.keyOf(rows[i].row, rows[i].index)
      const known = byKey.get(key)
      if (known === undefined) {
        heights[i] = estimate()
      } else {
        kept.set(key, known)
        heights[i] = known
        measured[i] = 1
      }
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
        for (let i = 0; i < heights.length; i++) {
          if (!measured[i]) {
            heights[i] = height
          }
        }
        from = 0
      }
      if (!measured[position] || Math.abs(heights[position] - height) > 0.5) {
        heights[position] = height
        measured[position] = 1
        byKey.set(o.keyOf(rows[position].row, rows[position].index), height)
        from = from < 0 ? position : Math.min(from, position)
      }
    }
    if (from >= 0) {
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

  const viewport = () => {
    if (container === null || container === window) {
      return { top: 0, height: globalThis.innerHeight }
    }
    const element = container as HTMLElement
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
  const scrollBy = (delta: number) => {
    if (Math.abs(delta) < 1 || !container) {
      return
    }
    container.scrollTo({
      top: scrollTopOf(container) + delta,
      behavior: 'instant'
    })
  }

  /** How far to scroll to show an item at `top` (client) with `height`. */
  const alignDelta = (top: number, height: number, align: Align) => {
    const view = viewport()
    // A sticky header that covers the top of the container hides a row
    // aligned to the top; the row goes below it.
    const head = o.table.value?.tHead?.getBoundingClientRect()
    const cover =
      head && head.top <= view.top + 1 && head.bottom > view.top
        ? head.bottom - view.top
        : 0
    const viewTop = view.top + cover
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
        const { align } = pending
        pending = null
        scrollBy(
          alignDelta(tr.getBoundingClientRect().top, itemHeight(tr), align)
        )
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
      const position = indexAt(offsets, scrollTop)
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

  const drawn = computed<Array<DrawnRow<T> | SpacerRow>>(() => {
    const { all, top } = parts.value
    if (!enabled()) {
      return all
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    version.value
    const rows = center()
    const before = expandedBefore.value
    // The header row is 1, the first body row 2.
    const at = (q: number): DrawnRow<T> => ({
      ...all[q],
      aria: q + before[q] + 2
    })
    const out: Array<DrawnRow<T> | SpacerRow> = []
    for (let q = 0; q < top; q++) {
      out.push(at(q))
    }
    if (printing.value) {
      for (let p = 0; p < rows.length; p++) {
        out.push(at(top + p))
      }
    } else {
      const end = Math.min(range.value.end, rows.length)
      const win = { start: Math.min(range.value.start, end), end }
      for (const segment of segmentsOf(offsets, win, keptPosition())) {
        if ('spacer' in segment) {
          out.push({ spacer: segment.spacer, key: spacerKeys[segment.slot] })
        } else {
          for (let p = segment.from; p < segment.to; p++) {
            out.push(at(top + p))
          }
        }
      }
    }
    for (let q = top + rows.length; q < all.length; q++) {
      out.push(at(q))
    }
    return out
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
      alignDelta(itemsTop(tbody) + offsets[position], heights[position], align)
    )
    schedule()
  }

  return {
    enabled,
    drawn,
    range,
    ready,
    centerCount: () => center().length,
    expandedCount: () => expandedBefore.value[expandedBefore.value.length - 1],
    scrollToIndex,
    onFocusIn,
    onFocusOut
  }
}
