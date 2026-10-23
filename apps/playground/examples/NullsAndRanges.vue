<script setup lang="ts">
import { defineDataset } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from '@dolusoft/query-table/local'
import { ref, shallowRef } from 'vue'

import { Button } from '@/ui/button'
import type {
  Column,
  ColumnType,
  FilterCondition,
  FilterRule,
  TableQuery
} from '@dolusoft/query-table'
import { QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { columnOf, currentDataset, type DemoRow } from '../scenarios'

// `IsNull`, `IsNotNull` and `Between` are opt-in (ADR 0020): a column offers
// them only when its `filterConditions` lists them, so a column without the
// list keeps the menu of its type. A condition without a value applies when
// it is picked and hides the input; `Between` draws two inputs, lower and
// upper, and emits one rule once both read. `useLocalQuery` evaluates them
// with the profile `tr-2`: null is a missing value, both bounds are
// inclusive, and a lower bound above the upper one keeps nothing.
const data = currentDataset()
const { primary, count, amount, date } = data.fields

// Some rows have no amount and no date, so the null conditions find them.
const missing = (id: number, key: string) =>
  (key === amount && id % 6 === 0) || (key === date && id % 8 === 0)
const allRows = shallowRef<DemoRow[]>(
  data
    .createRows()
    .map(
      row =>
        Object.fromEntries(
          Object.entries(row).filter(([key]) => !missing(row.id, key))
        ) as DemoRow
    )
)

const nulls: FilterCondition[] = ['IsNull', 'IsNotNull']
const ordered: FilterCondition[] = [
  'Between',
  'Equal',
  'GreaterThan',
  'LessThan',
  ...nulls
]
const columns: Column[] = [
  { field: 'id', title: 'ID', type: 'integer', filterable: false },
  // No list: the menu of a string column, as in 3.12.
  columnOf(data, primary),
  { ...columnOf(data, count), filterConditions: ordered },
  { ...columnOf(data, amount), filterConditions: ['Equal', ...nulls] },
  { ...columnOf(data, date), filterConditions: ordered }
]

const typeOf = (field: string): ColumnType =>
  columnOf(data, field).type ?? 'string'
const dataset = defineDataset<DemoRow>({
  key: 'id',
  fields: {
    id: { type: 'integer', filterable: false },
    [primary]: { type: typeOf(primary) },
    [count]: { type: typeOf(count) },
    [amount]: { type: typeOf(amount) },
    [date]: { type: typeOf(date) }
  }
})
const query = ref<TableQuery>({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: []
})
const local = useLocalQuery({ allRows, dataset, query, profile: 'tr-2' })

const title = (field: string) => columnOf(data, field).title ?? field
const setFilters = (filters: FilterRule[]) => {
  query.value = { ...query.value, page: 1, filters }
}
const { countBelow, countAbove } = data.samples
const presets: Array<{ label: string; filters: FilterRule[] }> = [
  {
    label: `No ${title(amount)}`,
    filters: [{ field: amount, condition: 'IsNull' }]
  },
  {
    label: `${title(count)} from ${countBelow.toLocaleString('en-US')} to ${countAbove.toLocaleString('en-US')}`,
    filters: [
      {
        field: count,
        condition: 'Between',
        value: countBelow,
        value2: countAbove
      }
    ]
  },
  {
    label: `${title(date)} is known`,
    filters: [{ field: date, condition: 'IsNotNull' }]
  }
]
</script>

<template>
  <div class="flex flex-col gap-3">
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
      <span class="text-sm text-muted-foreground"
        >{{ local.totalRows.value }} of 200 {{ data.noun.many }} match.</span
      >
    </div>
    <p
      v-if="local.error.value"
      role="alert"
      class="rounded border border-destructive p-3"
    >
      Query error: {{ local.error.value.code }} ({{
        local.error.value.field ?? local.error.value.path ?? 'query'
      }}).
    </p>
    <QueryTable
      v-else
      v-model:query="query"
      :columns="columns"
      :rows="local.rows.value"
      :total-rows="local.totalRows.value"
      auto-width
      :auto-width-max="240"
      row-key="id"
      :filter-debounce="300"
      sortable
      filterable
    >
      <template #filter-menu="menu"><FilterMenu :menu="menu" /></template>
      <template #empty>No matches. Try another range.</template>
      <template #pagination="page"><TablePager :page="page" /></template>
    </QueryTable>
  </div>
</template>
