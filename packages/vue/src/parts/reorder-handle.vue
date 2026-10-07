<script setup lang="ts">
import type { Column } from '../contract'
import { columnName } from '../core/labels'
import { useTableContext } from '../core/table-context'

const props = defineProps<{ column: Column }>()

const { reorder, labels } = useTableContext()

// One listener object per handle, made once; it reads the current column.
const on = reorder.listeners(() => props.column)
</script>

<template>
  <!-- C-73: a button that moves the column within its region, by drag or by
       key. The table draws no live region: the consumer announces. -->
  <button
    type="button"
    class="qt-reorder-handle"
    :aria-label="labels().moveColumn(columnName(column))"
    aria-keyshortcuts="ArrowLeft ArrowRight Home End"
    v-on="on"
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  </button>
</template>
