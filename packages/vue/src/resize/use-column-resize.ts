import { onBeforeUnmount, shallowRef } from 'vue'

import type { Column, ColumnResizePayload } from '../contract'

/** Default `Column.minWidth`, in pixels. */
const defaultMinWidth = 40

export interface ColumnResizeOptions {
  /** The `resizable` prop: whether the table draws resize handles. */
  resizable: () => boolean
  /** Measured width of a header cell, by `field`. */
  measuredWidth: (field: string) => number | undefined
  /** Measured width of the table. */
  tableWidth: () => number
  emit: (payload: ColumnResizePayload) => void
}

/**
 * A width limit a consumer gave, or `undefined` when it cannot be one. The
 * types say `number`, but a loosely typed consumer can pass `''`, `NaN`,
 * `0` or a negative: those count as unset instead of clamping to 0.
 */
const limitOf = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined

/**
 * The smallest width: `Column.minWidth`, else the default 40 (which gives way
 * to a smaller `Column.maxWidth`, so a maximum alone keeps working).
 */
export const minWidthOf = (column: Column) =>
  limitOf(column.minWidth) ??
  Math.min(defaultMinWidth, limitOf(column.maxWidth) ?? defaultMinWidth)

/** The largest width, or `undefined` for none. A `minWidth` above it wins. */
const maxWidthOf = (column: Column) => {
  const max = limitOf(column.maxWidth)
  return max === undefined ? undefined : Math.max(max, minWidthOf(column))
}

export const clampWidth = (column: Column, width: number) =>
  Math.round(
    Math.min(
      maxWidthOf(column) ?? Infinity,
      Math.max(minWidthOf(column), width)
    )
  )

/** Width of the content of a cell up to `until` (exclusive), padding and border included. */
const contentWidth = (cell: Element, until?: Element | null) => {
  const range = document.createRange()
  range.selectNodeContents(cell)
  if (until) {
    range.setEndBefore(until)
  }
  const style = getComputedStyle(cell)
  return [
    style.paddingLeft,
    style.paddingRight,
    style.borderLeftWidth,
    style.borderRightWidth
  ].reduce(
    (sum, value) => sum + (parseFloat(value) || 0),
    range.getBoundingClientRect().width
  )
}

/**
 * The widest rendered content of a column: the header label (the part before
 * the filter row and the handle) and the column's cells in this table's own
 * body rows. Only the rows given are measured (C-50).
 */
const autofitWidth = (th: HTMLTableCellElement, field: string) => {
  let widest = contentWidth(
    th,
    th.querySelector(':scope > .qt-filter, :scope > .qt-resize-handle')
  )
  for (const cell of th
    .closest('table')
    ?.tBodies[0]?.querySelectorAll(
      `:scope > tr[data-row-index] > td[data-field="${CSS.escape(field)}"]`
    ) ?? []) {
    widest = Math.max(widest, contentWidth(cell))
  }
  return Math.ceil(widest)
}

interface Drag {
  column: Column
  pointerId: number
  startX: number
  startWidth: number
  lastX: number
  frame: number
}

const cellOf = (event: Event) =>
  (event.currentTarget as HTMLElement).closest('th')

/**
 * Which edge of the column the handle stands for: `1` for the right edge,
 * `-1` for the left one. A right-pinned column stays at the right edge of the
 * scroll container, so it grows to the left: its handle stands for its left
 * edge, and moving that edge to the left widens it (C-71).
 */
const edgeOf = (column: Column) => (column.pinned === 'right' ? -1 : 1)

/**
 * Resizing a column (C-48 to C-50). The table holds a width only while a
 * drag is under way (the preview, P2); every committed width goes out as a
 * `columnResize` event and comes back, if the consumer wants it, as
 * `Column.width`. The handle captures the pointer, so all drag events arrive
 * at the handle itself, and it has the focus, so Escape does too.
 */
export const useColumnResize = (options: ColumnResizeOptions) => {
  const preview = shallowRef<{ field: string; width: number } | null>(null)
  let drag: Drag | null = null

  const isResizable = (column: Column) =>
    options.resizable() && column.resizable !== false

  /** The width the header shows: the preview while dragging, else measured. */
  const widthOf = (column: Column) =>
    preview.value?.field === column.field
      ? preview.value.width
      : Math.round(options.measuredWidth(column.field) ?? 0)

  const commit = (column: Column, from: number, width: number) => {
    const next = clampWidth(column, width)
    if (next !== Math.round(from)) {
      options.emit({ field: column.field, width: next })
    }
  }

  const dragged = (current: Drag) =>
    current.startWidth +
    edgeOf(current.column) * (current.lastX - current.startX)

  const end = (apply: boolean) => {
    const current = drag
    if (current) {
      drag = null
      cancelAnimationFrame(current.frame)
      preview.value = null
      if (apply) {
        commit(current.column, current.startWidth, dragged(current))
      }
    }
  }

  /** Every pointer event of a handle; one listener for the whole drag. */
  const onPointer = (event: PointerEvent, column: Column) => {
    if (event.type === 'pointerdown') {
      const th = cellOf(event)
      if (event.button !== 0 || drag || !th) {
        return
      }
      const handle = event.currentTarget as HTMLElement
      // No text selection and no focus ring flicker while dragging.
      event.preventDefault()
      handle.focus({ preventScroll: true })
      handle.setPointerCapture(event.pointerId)
      drag = {
        column,
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: th.getBoundingClientRect().width,
        lastX: event.clientX,
        frame: 0
      }
      return
    }
    if (!drag || event.pointerId !== drag.pointerId) {
      return
    }
    drag.lastX = event.clientX
    if (event.type === 'pointermove') {
      // One preview per frame, whatever the pointer rate (no layout thrash).
      drag.frame ||= requestAnimationFrame(() => {
        if (drag) {
          drag.frame = 0
          preview.value = {
            field: drag.column.field,
            width: clampWidth(drag.column, dragged(drag))
          }
        }
      })
    } else {
      // pointerup commits; pointercancel and a lost capture cancel.
      end(event.type === 'pointerup')
    }
  }

  /** Arrow keys step the width, Enter fits it; both from the rendered width. */
  const onKey = (event: KeyboardEvent, column: Column) => {
    const { key } = event
    if (drag) {
      if (key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        end(false)
      }
      return
    }
    const sign =
      (key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0) * edgeOf(column)
    const th = cellOf(event)
    if (th && (sign || key === 'Enter' || event.type === 'dblclick')) {
      event.preventDefault()
      const from = th.getBoundingClientRect().width
      commit(
        column,
        from,
        sign
          ? Math.round(from) + sign * (event.shiftKey ? 50 : 10)
          : autofitWidth(th, column.field)
      )
    }
  }

  /**
   * The listeners of one handle, as one `v-on` object made once per handle.
   * Pointer capture sends every drag event to the handle itself.
   */
  const listeners = (column: () => Column) => {
    const pointer = (event: PointerEvent) => {
      onPointer(event, column())
    }
    const key = (event: Event) => {
      onKey(event as KeyboardEvent, column())
    }
    return {
      pointerdown: pointer,
      pointermove: pointer,
      pointerup: pointer,
      pointercancel: pointer,
      lostpointercapture: pointer,
      keydown: key,
      dblclick: key,
      // The handle sits inside the header cell: a click never sorts.
      click: (event: Event) => {
        event.stopPropagation()
      }
    }
  }

  /** `aria-valuemax`: `maxWidth`, or else the table width (what can show). */
  const maxOf = (column: Column) =>
    maxWidthOf(column) ??
    Math.max(widthOf(column), Math.round(options.tableWidth()))

  onBeforeUnmount(() => {
    if (drag) {
      cancelAnimationFrame(drag.frame)
      drag = null
    }
  })

  return { preview, isResizable, widthOf, maxOf, listeners }
}

export type ColumnResize = ReturnType<typeof useColumnResize>
