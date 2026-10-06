<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'
import { CalendarIcon } from '@lucide/vue'
import { computed, ref } from 'vue'

import { Button } from '@/ui/button'
import { Calendar } from '@/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import type { FilterDatetimeSlotProps } from '@dolusoft/query-table'

// What a consumer puts in the `filter-datetime` slot: shadcn-vue's date
// picker (a Popover with a Calendar) in place of the table's date input. It
// reads `value` and writes through `updateValue` only; the popover is the
// consumer's, the table knows nothing about it.
const props = defineProps<{ date: FilterDatetimeSlotProps }>()
const open = ref(false)

// The filter text is an ISO day (`2024-03-01`); anything else shows empty.
const picked = computed<DateValue | undefined>(() => {
  try {
    return props.date.value
      ? parseDate(props.date.value.slice(0, 10))
      : undefined
  } catch {
    return undefined
  }
})
const title = computed(() => props.date.column.title ?? props.date.column.field)

const pick = (value: DateValue | undefined) => {
  props.date.updateValue(value ? value.toString() : '')
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        class="h-8 min-w-0 flex-1 justify-start gap-1.5 px-2 font-normal tabular-nums"
        :class="picked ? '' : 'text-muted-foreground'"
        :aria-label="`Filter ${title}${picked ? `, ${picked.toString()}` : ''}`"
      >
        <CalendarIcon class="opacity-60" />
        <span class="truncate">{{
          picked ? picked.toString() : 'Pick a date'
        }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0" align="start">
      <Calendar
        :model-value="picked"
        :default-placeholder="picked"
        initial-focus
        @update:model-value="pick($event as DateValue | undefined)"
      />
      <div class="flex justify-end border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          :disabled="!picked"
          @click="pick(undefined)"
        >
          Clear
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
