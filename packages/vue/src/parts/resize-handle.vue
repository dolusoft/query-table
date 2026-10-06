<script setup lang="ts">
import type { Column } from '../contract'
import { columnName } from '../core/labels'
import { useTableContext } from '../core/table-context'
import { minWidthOf } from '../resize/use-column-resize'

const props = defineProps<{ column: Column }>()

const { resize, labels } = useTableContext()

// One listener object per handle, made once; it reads the current column.
const on = resize.listeners(() => props.column)
</script>

<template>
  <!-- A focusable vertical separator (C-48): the value is the column width in
       pixels, from `minWidth` to `maxWidth` (or the table width). -->
  <div
    class="qt-resize-handle"
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
    :aria-label="labels().resizeColumn(columnName(column))"
    :aria-valuenow="resize.widthOf(column)"
    :aria-valuemin="minWidthOf(column)"
    :aria-valuemax="resize.maxOf(column)"
    v-on="on"
  />
</template>
