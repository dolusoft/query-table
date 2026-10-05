<script setup lang="ts">
import { ref } from 'vue'

import { Button } from '@/ui/button'

import type { FilterRule } from '../../src/contract'
import { VueServerTable } from '../../src/index'
import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { createDemoRows, typedColumns, useFakeServer } from '../scenarios'

// One column of every filter type. Typing applies after `filterDebounce`
// milliseconds; text columns read shortcuts (`*ali*`, `!bob`, `a,b`). The
// buttons below change `query.filters` from outside, the way a restored URL
// or a saved view would. City is a hidden column: its rules still apply.
// The clear-all button sits in the first utility column of the header, so
// the right panel column (`has-right-panel`) is turned on to hold it.
const columns = typedColumns()
const { query, result } = useFakeServer(createDemoRows(), { pageSize: 10 })
const nativeDatePicker = ref(false)

const setFilters = (filters: FilterRule[]) => {
  query.value = { ...query.value, page: 1, filters }
}
const presets: Array<{ label: string; filters: FilterRule[] }> = [
  {
    label: 'Name starts with "a" or is "Bob"',
    filters: [
      { field: 'name', condition: 'StartsWith', value: 'a' },
      { field: 'name', condition: 'Equal', value: 'Bob' }
    ]
  },
  {
    // Rules of one field combine with OR (C-17).
    label: 'Age under 25 or over 45 (two rules)',
    filters: [
      { field: 'age', condition: 'LessThan', value: 25 },
      { field: 'age', condition: 'GreaterThan', value: 45 }
    ]
  },
  {
    label: 'Only Ankara (hidden column)',
    filters: [{ field: 'city', condition: 'Equal', value: 'Ankara' }]
  },
  {
    label: 'Name equals "a*" (no shortcut for it)',
    filters: [{ field: 'name', condition: 'Equal', value: 'a*' }]
  }
]
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <Button
        v-for="preset in presets"
        :key="preset.label"
        variant="outline"
        size="sm"
        @click="setFilters(preset.filters)"
      >
        {{ preset.label }}
      </Button>
      <Button variant="ghost" size="sm" @click="setFilters([])">
        Remove all from outside
      </Button>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="nativeDatePicker" type="checkbox" />
        Native date picker (<code>filter-datetime</code> slot)
      </label>
    </div>
    <VueServerTable
      v-model:query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      row-key="id"
      :filter-debounce="300"
      has-right-panel
      filterable
      sortable
    >
      <template #filter-menu="menu">
        <FilterMenu :menu="menu" />
      </template>
      <template v-if="nativeDatePicker" #filter-datetime="date">
        <input
          type="date"
          class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
          :value="date.value ?? ''"
          @input="date.updateValue(($event.target as HTMLInputElement).value)"
        />
      </template>
      <template #empty>No results.</template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </VueServerTable>
  </div>
</template>
