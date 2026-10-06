<script setup lang="ts">
import { computed } from 'vue'

import { titleOf } from './column-filter'
import type { HeaderSlotProps } from '../../src/contract'

// The `header-<field>` slot of a compact table: the slot replaces the
// table's sort button, so it is drawn again here with `toggleSort`, and a
// funnel button beside it (a sibling, never nested) opens the column's filter
// sheet. The funnel is filled, and named "…, active", when the column has rules.
const props = defineProps<{
  header: HeaderSlotProps
  filterable: boolean
  active: boolean
}>()
const emit = defineEmits<{ filter: [trigger: HTMLElement] }>()

const title = computed(() => titleOf(props.header.column))
</script>

<template>
  <span class="flex items-center justify-between gap-1">
    <button
      v-if="props.header.sortable"
      type="button"
      class="qt-sort"
      @click="props.header.toggleSort"
    >
      {{ title }}
      <svg
        class="qt-sort-icon"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path
          v-if="props.header.sortDirection === 'asc'"
          d="M8 3.5L12.5 9.5H3.5L8 3.5Z"
          fill="currentColor"
        />
        <path
          v-else-if="props.header.sortDirection === 'desc'"
          d="M8 12.5L3.5 6.5H12.5L8 12.5Z"
          fill="currentColor"
        />
        <template v-else>
          <path d="M8 3L11.5 7H4.5L8 3Z" fill="currentColor" />
          <path d="M8 13L4.5 9H11.5L8 13Z" fill="currentColor" />
        </template>
      </svg>
    </button>
    <span v-else class="qt-title">{{ title }}</span>
    <button
      v-if="props.filterable"
      type="button"
      class="column-filter-trigger inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-active:text-primary"
      :data-active="props.active ? '' : undefined"
      :aria-label="`Filter ${title}${props.active ? ', active' : ''}`"
      aria-haspopup="dialog"
      @click="emit('filter', $event.currentTarget as HTMLElement)"
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        stroke="currentColor"
        stroke-width="1.5"
        :fill="props.active ? 'currentColor' : 'none'"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    </button>
  </span>
</template>
