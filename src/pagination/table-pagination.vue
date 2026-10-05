<script setup lang="ts">
import type { PaginationSlotProps } from '../contract'

defineProps<{ paginationProps: PaginationSlotProps }>()

defineSlots<{ pagination(props: PaginationSlotProps): unknown }>()
</script>

<template>
  <div
    class="bh-pagination"
    :data-page="paginationProps.page"
    :data-page-size="paginationProps.pageSize"
  >
    <slot name="pagination" v-bind="paginationProps" />
  </div>
</template>
