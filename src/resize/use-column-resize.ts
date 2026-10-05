import { onBeforeUnmount, shallowRef } from 'vue'

import type { Column, ColumnResizePayload } from '../contract'

/** Default `Column.minWidth`, in pixels. */
const defaultMinWidth = 40
const step = 10
const largeStep = 50

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

/** Horizontal padding and border of a cell. */
const chrome = (cell: Element) => {
  const style = getComputedStyle(cell)
  return [
    style.paddingLeft,
    style.paddingRight,
    style.borderLeftWidth,
    style.borderRightWidth
  ].reduce((sum, value) => sum + (parseFloat(value) || 0), 0)
}

/** Width of the content of a cell up to `until` (exclusive), or all of it. */
const contentWidth = (cell: Element, until?: Element | null) => {
  const range = document.createRange()
  range.selectNodeContents(cell)
  if (until) {
    range.setEndBefore(until)
  }
  return range.getBoundingClientRect().width + chrome(cell)
}

/**
 * The widest rendered content of a column: the header label (the part before
 * the filter row and the handle) and the column's cells in this table's own
 * body rows. Only the rows given are measured (C-50).
 */
const autofitWidth = (th: HTMLTableCellElement, field: string) => {
  const until = th.querySelector(
    ':scope > .qt-filter, :scope > .qt-resize-handle'
  )
  let widest = contentWidth(th, until)
  const body = th.closest('table')?.tBodies[0]
  const selector = `:scope > tr[data-row-index] > td[data-field="${CSS.escape(field)}"]`
  for (const cell of body?.querySelectorAll(selector) ?? []) {
    widest = Math.max(widest, contentWidth(cell))
  }
  return Math.ceil(widest)
}

interface Drag {
  field: string
  pointerId: number
  handle: HTMLElement
  startX: number
  startWidth: number
  lastX: number
  frame: number
  stop: () => void
}

/**
 * Resizing a column (C-48 to C-50). The table holds a width only while a
 * drag is under way (the preview, P2); every committed width goes out as a
 * `columnResize` event and comes back, if the consumer wants it, as
 * `Column.width`.
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

  const end = (column: Column, apply: boolean) => {
    const current = drag
    if (!current) {
      return
    }
    drag = null
    current.stop()
    cancelAnimationFrame(current.frame)
    if (current.handle.hasPointerCapture(current.pointerId)) {
      current.handle.releasePointerCapture(current.pointerId)
    }
    preview.value = null
    if (apply) {
      commit(
        column,
        current.startWidth,
        current.startWidth + current.lastX - current.startX
      )
    }
  }

  const onPointerDown = (event: PointerEvent, column: Column) => {
    if (event.button !== 0 || drag) {
      return
    }
    const handle = event.currentTarget as HTMLElement
    const th = handle.closest('th')
    if (!th) {
      return
    }
    // No text selection and no focus ring flicker while dragging.
    event.preventDefault()
    handle.focus({ preventScroll: true })
    handle.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) {
        return
      }
      drag.lastX = e.clientX
      // One preview per frame, whatever the pointer rate (no layout thrash).
      if (!drag.frame) {
        drag.frame = requestAnimationFrame(() => {
          if (drag) {
            drag.frame = 0
            preview.value = {
              field: column.field,
              width: clampWidth(
                column,
                drag.startWidth + drag.lastX - drag.startX
              )
            }
          }
        })
      }
    }
    const up = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.pointerId) {
        drag.lastX = e.clientX
        end(column, true)
      }
    }
    const cancel = () => {
      end(column, false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        end(column, false)
      }
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', cancel)
    handle.addEventListener('lostpointercapture', cancel)
    window.addEventListener('keydown', key, true)
    drag = {
      field: column.field,
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startWidth: th.getBoundingClientRect().width,
      lastX: event.clientX,
      frame: 0,
      stop: () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        handle.removeEventListener('pointercancel', cancel)
        handle.removeEventListener('lostpointercapture', cancel)
        window.removeEventListener('keydown', key, true)
      }
    }
  }

  const autofit = (handle: HTMLElement, column: Column) => {
    const th = handle.closest('th')
    if (th) {
      commit(
        column,
        th.getBoundingClientRect().width,
        autofitWidth(th, column.field)
      )
    }
  }

  const onKeyDown = (event: KeyboardEvent, column: Column) => {
    if (drag) {
      return
    }
    const handle = event.currentTarget as HTMLElement
    if (event.key === 'Enter') {
      event.preventDefault()
      autofit(handle, column)
      return
    }
    const sign =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (sign === 0) {
      return
    }
    event.preventDefault()
    const th = handle.closest('th')
    const from = th ? th.getBoundingClientRect().width : widthOf(column)
    commit(
      column,
      from,
      Math.round(from) + sign * (event.shiftKey ? largeStep : step)
    )
  }

  const onDoubleClick = (event: MouseEvent, column: Column) => {
    autofit(event.currentTarget as HTMLElement, column)
  }

  onBeforeUnmount(() => {
    if (drag) {
      const current = drag
      drag = null
      current.stop()
      cancelAnimationFrame(current.frame)
    }
  })

  return {
    preview,
    isResizable,
    widthOf,
    onPointerDown,
    onKeyDown,
    onDoubleClick
  }
}

export type ColumnResize = ReturnType<typeof useColumnResize>
