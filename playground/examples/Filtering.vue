<script setup lang="ts">
import { ref } from 'vue'

import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import type { FilterRule } from '@dolusoft/query-table'
import { QueryTable } from '@dolusoft/query-table'

import FilterDatePicker from '../harness/FilterDatePicker.vue'
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
const datePicker = ref(false)

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
      <Label class="font-normal">
        <Checkbox v-model="datePicker" />
        Date picker (<code>filter-datetime</code> slot)
      </Label>
    </div>
    <QueryTable
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
      <template v-if="datePicker" #filter-datetime="date">
        <FilterDatePicker :date="date" />
      </template>
      <template #empty>No results.</template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
  </div>
</template>
