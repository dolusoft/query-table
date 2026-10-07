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
import {
  columnOf,
  currentDataset,
  typedColumns,
  useFakeServer
} from '../scenarios'

// One column of every filter type. Typing applies after `filterDebounce`
// milliseconds; text columns read shortcuts (`*ali*`, `!bob`, `a,b`). The
// buttons below change `query.filters` from outside, the way a restored URL
// or a saved view would. The category column is hidden: its rules still
// apply. The clear-all button sits in the first utility column of the
// header, so the right panel column (`has-right-panel`) is turned on to hold
// it.
const data = currentDataset()
const columns = typedColumns(data)
const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })
const datePicker = ref(false)

const setFilters = (filters: FilterRule[]) => {
  query.value = { ...query.value, page: 1, filters }
}
const { primary, count, category } = data.fields
const { prefix, exact, countBelow, countAbove } = data.samples
const title = (field: string) => columnOf(data, field).title ?? field
const presets: Array<{ label: string; filters: FilterRule[] }> = [
  {
    label: `${title(primary)} starts with "${prefix}" or is "${exact}"`,
    filters: [
      { field: primary, condition: 'StartsWith', value: prefix },
      { field: primary, condition: 'Equal', value: exact }
    ]
  },
  {
    // Rules of one field combine with OR (C-17).
    label: `${title(count)} under ${countBelow.toLocaleString('en-US')} or over ${countAbove.toLocaleString('en-US')} (two rules)`,
    filters: [
      { field: count, condition: 'LessThan', value: countBelow },
      { field: count, condition: 'GreaterThan', value: countAbove }
    ]
  },
  {
    label: `Only ${data.samples.category} (hidden column)`,
    filters: [
      { field: category, condition: 'Equal', value: data.samples.category }
    ]
  },
  {
    label: `${title(primary)} equals "${prefix}*" (no shortcut for it)`,
    filters: [{ field: primary, condition: 'Equal', value: `${prefix}*` }]
  }
]
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- gap-x-4: the Checkbox's hit area reaches 0.75rem past its box, so a
         narrower gap puts it over the end of the button before it. -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
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
