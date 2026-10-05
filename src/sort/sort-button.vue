<script setup lang="ts">
import type { Column, SortDirection } from '../contract'

defineProps<{
  column: Column
  /** The direction the table is sorted in on this column, if any. */
  direction: SortDirection | null
}>()

defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="qt-sort"
    :aria-label="column.title ? undefined : column.field"
    @click="$emit('click')"
  >
    {{ column.title }}
    <svg
      v-if="direction === 'asc'"
      class="qt-sort-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d="M8 3.5L12.5 9.5H3.5L8 3.5Z" fill="currentColor" />
    </svg>
    <svg
      v-else-if="direction === 'desc'"
      class="qt-sort-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d="M8 12.5L3.5 6.5H12.5L8 12.5Z" fill="currentColor" />
    </svg>
    <svg
      v-else
      class="qt-sort-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d="M8 3L11.5 7H4.5L8 3Z" fill="currentColor" />
      <path d="M8 13L4.5 9H11.5L8 13Z" fill="currentColor" />
    </svg>
  </button>
</template>
