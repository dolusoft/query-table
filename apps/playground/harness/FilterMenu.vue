<script setup lang="ts">
import { ref } from 'vue'

import { Button } from '@/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Separator } from '@/ui/separator'
import type { FilterMenuSlotProps } from '@dolusoft/query-table'

// What a consumer writes in the `filter-menu` slot: the table's own trigger
// wrapped in a real shadcn-vue Popover, with the condition list, the sort
// buttons and "Clear filter" inside. The menu's own texts are the consumer's
// (the table only names the conditions, through `labels.filterCondition`), so
// a localised page passes `texts`.
interface MenuTexts {
  heading: string
  sortAscending: string
  sortDescending: string
  clearFilter: string
}
const props = defineProps<{
  menu: FilterMenuSlotProps
  texts?: Partial<MenuTexts>
}>()
const open = ref(false)

const text = (key: keyof MenuTexts) =>
  props.texts?.[key] ??
  {
    heading: 'Filter Condition',
    sortAscending: 'Sort Ascending',
    sortDescending: 'Sort Descending',
    clearFilter: 'Clear filter'
  }[key]

const pick = (run: () => void) => {
  run()
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <component :is="props.menu.trigger" />
    </PopoverTrigger>
    <PopoverContent align="start" class="w-56">
      <p class="text-xs font-medium text-muted-foreground">
        {{ text('heading') }}
      </p>
      <Button
        v-for="option in props.menu.conditions"
        :key="option.value"
        variant="ghost"
        size="sm"
        class="justify-start data-active:bg-muted data-active:text-foreground"
        :data-active="props.menu.condition === option.value ? '' : undefined"
        @click="pick(() => props.menu.setCondition(option.value))"
      >
        {{ option.label }}
      </Button>
      <template v-if="props.menu.sortable">
        <Separator />
        <Button
          variant="ghost"
          size="sm"
          class="justify-start"
          @click="pick(() => props.menu.setSort('asc'))"
        >
          {{ text('sortAscending') }}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="justify-start"
          @click="pick(() => props.menu.setSort('desc'))"
        >
          {{ text('sortDescending') }}
        </Button>
      </template>
      <Separator />
      <Button
        variant="ghost"
        size="sm"
        class="justify-start text-destructive"
        @click="pick(() => props.menu.clear())"
      >
        {{ text('clearFilter') }}
      </Button>
    </PopoverContent>
  </Popover>
</template>
