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
    <!-- Cursor paging has no page number: the server sends cursors only. -->
    <span
      v-if="page.cursorMode"
      class="page-info text-sm whitespace-nowrap text-muted-foreground"
      >Cursor paging</span
    >
    <span
      v-else
      class="page-info text-sm whitespace-nowrap text-muted-foreground"
      >Page {{ page.page }} of {{ page.pageCount ?? '?' }}</span
    >
    <div class="flex flex-wrap items-center gap-2">
      <Label :for="sizeId">Rows per page</Label>
      <!-- Chromium's native popup needs an opaque select background: a
           translucent input surface can leave its list white. The touch
           target is a min-height: the select's own `data-[size=sm]:h-7`
           outranks a height utility here, and it stays 2.75rem on a wide
           touch screen, where only a fine pointer gets the compact size. -->
      <NativeSelect
        :id="sizeId"
        size="sm"
        aria-label="Rows per page"
        class="page-size [&_select]:min-h-11 [&_select]:bg-background [&_select]:tabular-nums lg:pointer-fine:[&_select]:min-h-0"
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
        class="previous-page min-h-11 lg:pointer-fine:min-h-0"
        :disabled="!page.canPrevious"
        @click="page.previousPage()"
      >
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="next-page min-h-11 lg:pointer-fine:min-h-0"
        :disabled="!page.canNext"
        @click="page.nextPage()"
      >
        Next
      </Button>
    </div>
  </div>
</template>
