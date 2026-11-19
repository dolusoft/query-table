<script setup lang="ts">
import { computed } from 'vue'

import type { CellPreviewProps } from './contract'
import { useCellLabels } from '../core/table-labels'

defineOptions({ name: 'CellPreview' })

const props = defineProps<CellPreviewProps>()

const emit = defineEmits<{
  /** The button was pressed. Showing the preview is the consumer's (C-129). */
  preview: [text: string]
}>()

const labels = useCellLabels()
const value = () => String(props.text)
// One name for `aria-label` and `title`, computed once per change.
const name = computed(() => labels().previewValue(value()))
</script>

<template>
  <span class="qt-cell-preview">
    <span class="qt-cell-preview-text">{{ text }}</span>
    <button
      type="button"
      class="qt-cell-preview-button"
      :aria-label="name"
      :title="name"
      @click="emit('preview', value())"
    >
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
        <path
          d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"
        />
        <circle cx="8" cy="8" r="1.75" />
      </svg>
    </button>
  </span>
</template>
