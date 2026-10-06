<script setup lang="ts">
import { XIcon } from '@lucide/vue'
import { computed, nextTick, ref, useId } from 'vue'

import { Button } from '@/ui/button'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'

import { describeRules, titleOf } from './column-filter'
import type { Column, TableQuery } from '../../src/contract'

// The committed filters of a compact table, one chip per filtered field
// (hidden columns included): "City contains ank" edits it, × removes it.
// "Add filter" reaches every filterable column, also the ones scrolled out of
// view or hidden. Editing goes through the column's sheet (`edit`).
const props = defineProps<{ columns: Column[] }>()
const query = defineModel<TableQuery>('query', { required: true })
const emit = defineEmits<{ edit: [field: string, trigger: HTMLElement] }>()

const pickerId = useId()
const picker = () =>
  document.getElementById(pickerId) as HTMLSelectElement | null

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
  picker()?.focus()
}

const clearAll = async () => {
  setFilters([])
  await nextTick()
  picker()?.focus()
}

// The picker is a menu, not a value: it goes back to "+ Add filter" once a
// column is picked.
const picked = ref('')
const pick = async (event: Event) => {
  const select = event.target as HTMLSelectElement
  const field = select.value
  if (field) {
    emit('edit', field, select)
  }
  // The select reports its value after this handler; reset it after that.
  await nextTick()
  picked.value = ''
}

defineExpose({ focus: picker })
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" data-testid="filter-chips">
    <ul
      v-if="chips.length > 0"
      class="flex flex-wrap gap-2"
      aria-label="Active filters"
    >
      <!-- A chip is a shadcn-vue button pair: edit, then remove. -->
      <li
        v-for="chip in chips"
        :key="chip.field"
        class="inline-flex max-w-full items-center"
        data-testid="filter-chip"
      >
        <Button
          type="button"
          variant="secondary"
          class="h-11 min-w-0 shrink justify-start rounded-r-none"
          :aria-label="`Edit filter: ${chip.text}`"
          aria-haspopup="dialog"
          @click="emit('edit', chip.field, $event.currentTarget as HTMLElement)"
        >
          <span class="truncate">{{ chip.text }}</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          class="size-11 rounded-l-none border-l border-background"
          :aria-label="`Remove filter: ${chip.text}`"
          data-testid="filter-chip-remove"
          @click="remove(chip.field)"
        >
          <XIcon />
        </Button>
      </li>
    </ul>
    <NativeSelect
      :id="pickerId"
      v-model="picked"
      class="[&_select]:h-11 [&_select]:bg-background"
      aria-label="Add filter"
      data-testid="add-filter"
      @change="pick"
    >
      <NativeSelectOption value="">+ Add filter</NativeSelectOption>
      <NativeSelectOption
        v-for="column in filterable"
        :key="column.field"
        :value="column.field"
      >
        {{ titleOf(column) }}
      </NativeSelectOption>
    </NativeSelect>
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
