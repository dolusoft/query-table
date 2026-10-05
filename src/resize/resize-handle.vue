<script setup lang="ts">
import type { Column } from '../contract'
import { minWidthOf } from './use-column-resize'
import { columnName } from '../core/labels'
import { useTableContext } from '../core/table-context'

defineProps<{ column: Column }>()

const { resize, labels, tableWidth } = useTableContext()

// A focusable vertical separator (C-48): the value is the column width in
// pixels, from `minWidth` to `maxWidth` (or, without one, the table width,
// which bounds what the current layout shows).
const maxOf = (column: Column, now: number) =>
  column.maxWidth ?? Math.max(now, Math.round(tableWidth()))
</script>

<template>
  <div
    class="qt-resize-handle"
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
    :aria-label="labels().resizeColumn(columnName(column))"
    :aria-valuenow="resize.widthOf(column)"
    :aria-valuemin="minWidthOf(column)"
    :aria-valuemax="maxOf(column, resize.widthOf(column))"
    @pointerdown="resize.onPointer($event, column)"
    @pointermove="resize.onPointer($event, column)"
    @pointerup="resize.onPointer($event, column)"
    @pointercancel="resize.onPointer($event, column)"
    @lostpointercapture="resize.onPointer($event, column)"
    @keydown="resize.onKeyDown($event, column)"
    @dblclick="resize.autofit($event, column)"
    @click.stop
  />
</template>
