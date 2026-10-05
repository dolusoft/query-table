<script setup lang="ts">
import { ref } from 'vue'

import { Button } from '@/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'

import type { FilterMenuSlotProps } from '../../../src/contract'

// What a consumer writes in the `filter-menu` slot: the table's own trigger
// wrapped in a real shadcn-vue Popover, with the condition list, the sort
// buttons and "Clear filter" inside.
const props = defineProps<{ menu: FilterMenuSlotProps }>()
const open = ref(false)

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
      <p class="text-xs font-medium text-muted-foreground">Filter Condition</p>
      <Button
        v-for="option in props.menu.conditions"
        :key="option.value"
        variant="ghost"
        size="sm"
        class="justify-start"
        :data-active="props.menu.condition === option.value ? '' : undefined"
        @click="pick(() => props.menu.setCondition(option.value))"
      >
        {{ option.label }}
      </Button>
      <template v-if="props.menu.sortable">
        <hr class="border-border" />
        <Button
          variant="ghost"
          size="sm"
          class="justify-start"
          @click="pick(() => props.menu.setSort('asc'))"
        >
          Sort Ascending
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="justify-start"
          @click="pick(() => props.menu.setSort('desc'))"
        >
          Sort Descending
        </Button>
      </template>
      <hr class="border-border" />
      <Button
        variant="ghost"
        size="sm"
        class="justify-start text-destructive"
        @click="pick(() => props.menu.clear())"
      >
        Clear filter
      </Button>
    </PopoverContent>
  </Popover>
</template>
