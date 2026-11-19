<script setup lang="ts">
defineOptions({ name: 'CellActions' })

defineSlots<{
  /** The `CellAction` buttons. */
  default?(): unknown
}>()
</script>

<template>
  <span class="qt-cell-actions"><slot /></span>
</template>
