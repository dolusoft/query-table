<script setup lang="ts">
import { Button } from '@/ui/button'

import type { PaginationSlotProps } from '../../src/contract'

// What a consumer puts in the `pagination` slot, after shadcn's data-table
// example: muted page text on the left, page size and previous/next on the
// right. Every value and action comes from the slot props.
defineProps<{ page: PaginationSlotProps }>()
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <span class="page-info text-sm text-muted-foreground"
      >Page {{ page.page }} of {{ page.pageCount ?? '?' }}</span
    >
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium">Rows per page</span>
      <!-- Chromium's native popup needs an opaque select background:
           a translucent input surface can leave its list white. -->
      <select
        aria-label="Rows per page"
        class="page-size h-7 rounded-lg border border-input bg-background px-2 text-[0.8rem] text-foreground tabular-nums transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        :value="page.pageSize"
        @change="
          page.setPageSize(Number(($event.target as HTMLSelectElement).value))
        "
      >
        <option
          v-for="n in page.pageSizeOptions"
          :key="n"
          :value="n"
          class="bg-popover text-popover-foreground"
        >
          {{ n }}
        </option>
      </select>
      <Button
        variant="outline"
        size="sm"
        class="previous-page"
        :disabled="!page.canPrevious"
        @click="page.previousPage()"
      >
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="next-page"
        :disabled="!page.canNext"
        @click="page.nextPage()"
      >
        Next
      </Button>
    </div>
  </div>
</template>
