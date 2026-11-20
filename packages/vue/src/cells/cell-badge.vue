<script setup lang="ts">
import type { CellBadgeProps } from './contract'

defineOptions({ name: 'CellBadge' })

withDefaults(defineProps<CellBadgeProps>(), {
  text: undefined,
  tone: 'neutral'
})

defineSlots<{
  /** Replaces `text`. */
  default?(): unknown
}>()
</script>

<template>
  <span class="qt-cell-badge" :data-tone="tone"
    ><slot>{{ text }}</slot></span
  >
</template>
