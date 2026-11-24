<script setup lang="ts">
import { computed } from 'vue'

import type { CellCopyProps } from './contract'
import { IconSlot, useCellLabels } from '../core/table-labels'

defineOptions({ name: 'CellCopy' })

const props = defineProps<CellCopyProps>()

const emit = defineEmits<{
  /** The button was pressed. Writing the clipboard is the consumer's (C-129). */
  copy: [value: string]
}>()

const labels = useCellLabels()
const text = () => String(props.value)
// One name for `aria-label` and `title`, computed once per change.
const name = computed(() => labels().copyValue(text()))
</script>

<template>
  <span class="qt-cell-copy">
    <code class="qt-cell-copy-text">{{ value }}</code>
    <button
      type="button"
      class="qt-cell-copy-button"
      :aria-label="name"
      :title="name"
      @click="emit('copy', text())"
    >
      <!-- C-131: the table's `icon-copy` slot, else the built-in icon. -->
      <icon-slot name="copy">
        <svg
          class="qt-cell-icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.5" />
          <path d="M3 10.5V4a1 1 0 0 1 1-1h6.5" />
        </svg>
      </icon-slot>
    </button>
  </span>
</template>
