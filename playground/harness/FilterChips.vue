<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

import { Button } from '@/ui/button'

import { describeRules, titleOf } from './column-filter'
import type { Column, TableQuery } from '../../src/contract'

// The committed filters of a compact table, one chip per filtered field
// (hidden columns included): "City contains ank" edits it, × removes it.
// "Add filter" reaches every filterable column, also the ones scrolled out of
// view or hidden. Editing goes through the column's sheet (`edit`).
const props = defineProps<{ columns: Column[] }>()
const query = defineModel<TableQuery>('query', { required: true })
const emit = defineEmits<{ edit: [field: string, trigger: HTMLElement] }>()

const picker = ref<HTMLSelectElement | null>(null)

const chips = computed(() => {
  const fields = [...new Set(query.value.filters.map(rule => rule.field))]
  return fields.map(field => {
    const column = props.columns.find(
      candidate => candidate.field === field
    ) ?? { field }
    const text = describeRules(
      column,
      query.value.filters.filter(rule => rule.field === field)
    )
    return { field, text }
  })
})

const filterable = computed(() =>
  props.columns.filter(column => column.filterable !== false)
)

const setFilters = (filters: TableQuery['filters']) => {
  query.value = { ...query.value, page: 1, filters }
}

// The removed chip takes focus with it; hand it to the picker.
const remove = async (field: string) => {
  setFilters(query.value.filters.filter(rule => rule.field !== field))
  await nextTick()
  picker.value?.focus()
}

const clearAll = async () => {
  setFilters([])
  await nextTick()
  picker.value?.focus()
}

const pick = (event: Event) => {
  const select = event.target as HTMLSelectElement
  const field = select.value
  select.value = ''
  if (field) {
    emit('edit', field, select)
  }
}

defineExpose({ focus: () => picker.value })
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" data-testid="filter-chips">
    <ul
      v-if="chips.length > 0"
      class="flex flex-wrap gap-2"
      aria-label="Active filters"
    >
      <li
        v-for="chip in chips"
        :key="chip.field"
        class="inline-flex max-w-full items-center rounded-lg border border-border bg-secondary text-sm text-secondary-foreground"
        data-testid="filter-chip"
      >
        <button
          type="button"
          class="min-h-11 truncate rounded-l-lg px-3 text-left hover:bg-muted"
          :aria-label="`Edit filter: ${chip.text}`"
          aria-haspopup="dialog"
          @click="emit('edit', chip.field, $event.currentTarget as HTMLElement)"
        >
          {{ chip.text }}
        </button>
        <button
          type="button"
          class="inline-flex size-11 shrink-0 items-center justify-center rounded-r-lg border-l border-border hover:bg-muted"
          :aria-label="`Remove filter: ${chip.text}`"
          data-testid="filter-chip-remove"
          @click="remove(chip.field)"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </li>
    </ul>
    <select
      ref="picker"
      class="h-11 rounded-lg border border-input bg-background px-2 text-sm"
      aria-label="Add filter"
      data-testid="add-filter"
      @change="pick"
    >
      <option value="">+ Add filter</option>
      <option
        v-for="column in filterable"
        :key="column.field"
        :value="column.field"
      >
        {{ titleOf(column) }}
      </option>
    </select>
    <Button
      v-if="chips.length > 0"
      type="button"
      variant="ghost"
      class="h-11"
      @click="clearAll"
    >
      Clear all
    </Button>
  </div>
</template>
