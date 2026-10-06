<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'

import type { Column, TableQuery } from '../../src/contract'
import { parseFilterInput } from '../../src/index'

// What a consumer can draw when the header has no room for a filter row: one
// "Filters" button with a panel that holds a filter input per column. It
// writes the same `query.filters` the header inputs do, through the table's
// own grammar (`parseFilterInput`), so `*ank*`, `>30` or `ist*,!*mir` mean
// the same thing here and in the header.
const props = defineProps<{ columns: Column[] }>()
const query = defineModel<TableQuery>('query', { required: true })

const open = ref(false)
const filterable = computed(() =>
  props.columns.filter(column => column.filterable !== false && !column.hide)
)
const texts = reactive<Record<string, string>>({})

const rulesOf = (field: string) =>
  query.value.filters.filter(rule => rule.field === field)

// Opening the panel shows the filters in the query: the text typed here last,
// or the rule values when another control (the header row) set them.
watch(open, isOpen => {
  if (!isOpen) {
    return
  }
  for (const column of filterable.value) {
    const rules = rulesOf(column.field)
    if (rules.length === 0) {
      texts[column.field] = ''
    } else if (!texts[column.field]) {
      texts[column.field] = rules.map(rule => String(rule.value)).join(',')
    }
  }
})

const activeCount = computed(
  () => new Set(query.value.filters.map(rule => rule.field)).size
)

const apply = () => {
  const fields = new Set(filterable.value.map(column => column.field))
  const filters = query.value.filters.filter(rule => !fields.has(rule.field))
  for (const column of filterable.value) {
    filters.push(...parseFilterInput(texts[column.field] ?? '', column))
  }
  query.value = { ...query.value, page: 1, filters }
  open.value = false
}

const clearAll = () => {
  for (const field of Object.keys(texts)) {
    texts[field] = ''
  }
  query.value = { ...query.value, page: 1, filters: [] }
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm" data-testid="filter-sheet-button">
        Filters
        <span
          v-if="activeCount > 0"
          class="rounded-sm bg-secondary px-1.5 text-xs text-secondary-foreground"
          data-testid="filter-sheet-count"
        >
          {{ activeCount }}
        </span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-[min(20rem,calc(100vw-2rem))]">
      <form class="flex flex-col gap-3" @submit.prevent="apply">
        <label
          v-for="column in filterable"
          :key="column.field"
          class="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
        >
          {{ column.title ?? column.field }}
          <Input
            v-model="texts[column.field]"
            :placeholder="column.type === 'date' ? 'yyyy-mm-dd' : ''"
            class="text-foreground"
          />
        </label>
        <div class="flex justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" @click="clearAll">
            Clear all
          </Button>
          <Button type="submit" size="sm">Apply</Button>
        </div>
      </form>
    </PopoverContent>
  </Popover>
</template>
