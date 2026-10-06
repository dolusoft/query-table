<script setup lang="ts">
// `filled` marks an applied filter: the funnel is painted instead of outlined.
defineProps<{ filled?: boolean }>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    stroke="currentColor"
    stroke-width="1.5"
    :fill="filled ? 'currentColor' : 'none'"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
</template>
