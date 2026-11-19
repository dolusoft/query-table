<script setup lang="ts">
import type { CellStackProps } from './contract'

defineOptions({ name: 'CellStack' })

const props = defineProps<CellStackProps>()

const slots = defineSlots<{
  /** Replaces `primary`. */
  primary?(): unknown
  /** Replaces `secondary`. */
  secondary?(): unknown
}>()

const hasSecondary = () =>
  slots.secondary !== undefined ||
  (props.secondary !== undefined &&
    props.secondary !== null &&
    props.secondary !== '')
</script>

<template>
  <span class="qt-cell-stack">
    <span class="qt-cell-primary"
      ><slot name="primary">{{ primary }}</slot></span
    >
    <span v-if="hasSecondary()" class="qt-cell-secondary"
      ><slot name="secondary">{{ secondary }}</slot></span
    >
  </span>
</template>
