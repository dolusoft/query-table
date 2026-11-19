<script setup lang="ts">
import type { CellActionProps } from './contract'

// Attributes and listeners (`onClick`, `aria-label`, `disabled`) fall
// through to the button: the action is the consumer's.
defineOptions({ name: 'CellAction' })

withDefaults(defineProps<CellActionProps>(), { kind: 'default' })

defineSlots<{
  /** The button's text, the consumer's content (C-129). */
  default?(): unknown
}>()
</script>

<template>
  <button type="button" class="qt-cell-action" :data-kind="kind">
    <slot />
  </button>
</template>
