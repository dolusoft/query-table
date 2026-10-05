import { onBeforeUnmount, shallowRef } from 'vue'

import type { Column, ColumnResizePayload } from '../contract'

/** Default `Column.minWidth`, in pixels. */
const defaultMinWidth = 40

export interface ColumnResizeOptions {
  /** The `resizable` prop: whether the table draws resize handles. */
  resizable: () => boolean
  /** Measured width of a header cell, by `field`. */
  measuredWidth: (field: string) => number | undefined
  emit: (payload: ColumnResizePayload) => void
}

export const minWidthOf = (column: Column) => column.minWidth ?? defaultMinWidth

export const clampWidth = (column: Column, width: number) =>
  Math.round(
    Math.min(column.maxWidth ?? Infinity, Math.max(minWidthOf(column), width))
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
    current.startWidth + current.lastX - current.startX

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

  const autofit = (event: Event, column: Column) => {
    const th = cellOf(event)
    if (th) {
      commit(
        column,
        th.getBoundingClientRect().width,
        autofitWidth(th, column.field)
      )
    }
  }

  const onKeyDown = (event: KeyboardEvent, column: Column) => {
    const { key } = event
    if (drag) {
      if (key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        end(false)
      }
      return
    }
    const sign = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
    if (key === 'Enter') {
      event.preventDefault()
      autofit(event, column)
    } else if (sign) {
      event.preventDefault()
      const from =
        cellOf(event)?.getBoundingClientRect().width ?? widthOf(column)
      commit(column, from, Math.round(from) + sign * (event.shiftKey ? 50 : 10))
    }
  }

  onBeforeUnmount(() => {
    if (drag) {
      cancelAnimationFrame(drag.frame)
      drag = null
    }
  })

  return {
    preview,
    isResizable,
    widthOf,
    onPointer,
    onKeyDown,
    autofit
  }
}

export type ColumnResize = ReturnType<typeof useColumnResize>
