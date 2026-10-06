<script setup lang="ts">
import { Button } from '@/ui/button'

import type { PaginationSlotProps } from '../../src/contract'

// What a consumer puts in the `pagination` slot, after shadcn's data-table
// example: muted page text on the left, page size and previous/next on the
// right. Every value and action comes from the slot props.
defineProps<{ page: PaginationSlotProps }>()
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <span class="page-info text-sm whitespace-nowrap text-muted-foreground"
      >Page {{ page.page }} of {{ page.pageCount ?? '?' }}</span
    >
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-2 text-sm font-medium">
        Rows per page
        <!-- Chromium's native popup needs an opaque select background:
             a translucent input surface can leave its list white. -->
        <select
          aria-label="Rows per page"
          class="page-size h-10 rounded-lg border border-input bg-background px-2 text-[0.8rem] text-foreground tabular-nums transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-7"
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
      </label>
      <Button
        variant="outline"
        size="sm"
        class="previous-page min-h-10 lg:min-h-0"
        :disabled="!page.canPrevious"
        @click="page.previousPage()"
      >
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="next-page min-h-10 lg:min-h-0"
        :disabled="!page.canNext"
        @click="page.nextPage()"
      >
        Next
      </Button>
    </div>
  </div>
</template>
