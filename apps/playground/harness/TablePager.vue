<script setup lang="ts">
import { useId } from 'vue'

import { Button } from '@/ui/button'
import { Label } from '@/ui/label'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'
import type { PaginationSlotProps } from '@dolusoft/query-table'

// What a consumer puts in the `pagination` slot, after shadcn's data-table
// example: muted page text on the left, page size and previous/next on the
// right. Every value and action comes from the slot props.
defineProps<{ page: PaginationSlotProps }>()
const sizeId = useId()
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <span class="page-info text-sm whitespace-nowrap text-muted-foreground"
      >Page {{ page.page }} of {{ page.pageCount ?? '?' }}</span
    >
    <div class="flex flex-wrap items-center gap-2">
      <Label :for="sizeId">Rows per page</Label>
      <!-- Chromium's native popup needs an opaque select background: a
           translucent input surface can leave its list white. -->
      <NativeSelect
        :id="sizeId"
        size="sm"
        aria-label="Rows per page"
        class="page-size [&_select]:h-10 [&_select]:bg-background [&_select]:tabular-nums lg:[&_select]:h-7"
        :model-value="page.pageSize"
        @change="
          page.setPageSize(Number(($event.target as HTMLSelectElement).value))
        "
      >
        <NativeSelectOption
          v-for="n in page.pageSizeOptions"
          :key="n"
          :value="n"
          class="bg-popover text-popover-foreground"
        >
          {{ n }}
        </NativeSelectOption>
      </NativeSelect>
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
