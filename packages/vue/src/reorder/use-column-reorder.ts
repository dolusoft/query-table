import {
  nextTick,
  onBeforeUnmount,
  shallowRef,
  watch,
  type ShallowRef
} from 'vue'

import type { Column } from '../contract'
import type { QueryTableLayout } from '../use-query-table'

export interface ColumnReorderOptions {
  /** The `reorderable` prop: whether the table draws reorder handles. */
  reorderable: () => boolean
  /** The table element: drop targets and refocus look at its own header only. */
  table: ShallowRef<HTMLTableElement | null>
  layout: QueryTableLayout
  /** The `columns` prop: an outside change ends a drag (C-73). */
  columns: () => Column[]
}

/** What the header shows while a column is dragged (C-73). */
export interface ColumnDrag {
  field: string
  /** The header cell the column would be placed next to, if any. */
  target: string | null
  place: 'before' | 'after'
}

interface Drag {
  field: string
  pointerId: number
  /** Visible header cells of the region at the start: field and box. */
  cells: Array<{ field: string; left: number; right: number }>
}

const placeOf = (key: string) =>
  key === 'ArrowLeft' || key === 'Home' ? 'before' : 'after'

/**
 * Reordering a column with its handle (C-73): a pointer drag or the arrow
 * keys, Home and End, inside the column's region. The table keeps only the
 * drag in progress (P15); the order itself goes out as `update:columns` and
 * comes back, if the consumer wants it, as the order of `columns`. Like the
 * resize handle, the handle captures the pointer, so every drag event
 * arrives at the handle itself, and it has the focus, so Escape does too.
 */
export const useColumnReorder = (options: ColumnReorderOptions) => {
  const dragging = shallowRef<ColumnDrag | null>(null)
  let drag: Drag | null = null
  /** The column whose handle moved it by key and still has the focus. */
  let refocus: string | null = null
  /** Between the new `columns` and their render: a blur then is the move's. */
  let patching = false

  const isReorderable = (column: Column) =>
    options.reorderable() && column.reorderable !== false

  /** This table's own header cell, never one of a nested table. */
  const headerCell = (field: string) =>
    options.table.value?.querySelector<HTMLElement>(
      `:scope > thead > tr > th[data-field="${CSS.escape(field)}"]`
    ) ?? null

  const end = () => {
    drag = null
    dragging.value = null
  }

  /** Every pointer event of a handle; one listener for the whole drag. */
  const onPointer = (event: PointerEvent, column: Column) => {
    if (event.type === 'pointerdown') {
      if (event.button !== 0 || drag) {
        return
      }
      const handle = event.currentTarget as HTMLElement
      // No text selection while dragging; the handle takes the focus itself.
      event.preventDefault()
      handle.focus({ preventScroll: true })
      handle.setPointerCapture(event.pointerId)
      refocus = null
      drag = {
        field: column.field,
        pointerId: event.pointerId,
        cells: options.layout.regionOf(column.field).flatMap(field => {
          const box = headerCell(field)?.getBoundingClientRect()
          return box ? [{ field, left: box.left, right: box.right }] : []
        })
      }
      dragging.value = { field: column.field, target: null, place: 'after' }
      return
    }
    if (!drag || event.pointerId !== drag.pointerId) {
      return
    }
    if (event.type === 'pointermove') {
      const x = event.clientX
      const over = drag.cells.find(cell => x >= cell.left && x < cell.right)
      const target = over && over.field !== drag.field ? over.field : null
      const place =
        over && x < (over.left + over.right) / 2 ? 'before' : 'after'
      const current = dragging.value
      if (current?.target !== target || current.place !== place) {
        dragging.value = { field: drag.field, target, place }
      }
      return
    }
    // pointerup places the column; pointercancel and a lost capture cancel.
    const done = dragging.value
    end()
    if (event.type === 'pointerup' && done?.target) {
      options.layout.moveColumn(done.field, done.target, done.place)
    }
  }

  const onKey = (event: KeyboardEvent, column: Column) => {
    const { key } = event
    if (drag) {
      if (key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        end()
      }
      return
    }
    // Alt+Arrow, Ctrl+Home and the like keep their browser meaning.
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return
    }
    const region = options.layout.regionOf(column.field)
    const at = region.indexOf(column.field)
    const target =
      key === 'ArrowLeft'
        ? region[at - 1]
        : key === 'ArrowRight'
          ? region[at + 1]
          : key === 'Home'
            ? region[0]
            : key === 'End'
              ? region[region.length - 1]
              : undefined
    if (at < 0 || target === undefined) {
      return
    }
    event.preventDefault()
    if (target !== column.field) {
      refocus = column.field
      options.layout.moveColumn(column.field, target, placeOf(key))
    }
  }

  // New `columns`: an outside change ends a drag; a written-back order gives
  // the focus back to the moved column's handle, which a keyed move of its
  // header cell can drop.
  watch(options.columns, () => {
    patching = true
  })
  watch(
    options.columns,
    () => {
      patching = false
      if (drag) {
        end()
      }
      const field = refocus
      if (field !== null) {
        void nextTick(() => {
          const handle = headerCell(field)?.querySelector<HTMLElement>(
            ':scope > .qt-reorder-handle'
          )
          if (
            handle &&
            refocus === field &&
            document.activeElement !== handle
          ) {
            handle.focus({ preventScroll: true })
          }
        })
      }
    },
    { flush: 'post' }
  )

  onBeforeUnmount(end)

  /**
   * The listeners of one handle, as one `v-on` object made once per handle.
   * Pointer capture sends every drag event to the handle itself.
   */
  const listeners = (column: () => Column) => {
    const pointer = (event: Event) => {
      onPointer(event as PointerEvent, column())
    }
    return {
      pointerdown: pointer,
      pointermove: pointer,
      pointerup: pointer,
      pointercancel: pointer,
      lostpointercapture: pointer,
      keydown: (event: Event) => {
        onKey(event as KeyboardEvent, column())
      },
      // The user left the handle: nothing to give back. A blur while the
      // moved header renders is the move's, not the user's.
      blur: () => {
        if (!patching) {
          refocus = null
        }
      },
      // The handle sits inside the header cell: a click never sorts.
      click: (event: Event) => {
        event.stopPropagation()
      }
    }
  }

  return { isReorderable, dragging, listeners }
}

export type ColumnReorder = ReturnType<typeof useColumnReorder>
