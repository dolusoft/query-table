<script setup lang="ts">
import { DataTable } from '@dolusoft/query-table/data-table'
import { ref, shallowRef } from 'vue'

import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import {
  QueryTable,
  type Column,
  type QueryChangeReason,
  type TableQuery
} from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { columnOf, currentDataset, makeQuery, type DemoRow } from '../scenarios'

// Every row is in the page. `DataTable` is `useLocalQuery` and `QueryTable`
// together (ADR 0021): no `v-model:query`, no dataset and no total to wire.
// It builds the dataset from the columns (C-126), holds the query itself
// (C-125) and draws the DOM of `QueryTable` (C-127), so the skin, the filter
// menu and the pager are the ones of every other page. `search` names the
// fields of the global search; `expand-mode="single"` opens one row at a time.
const data = currentDataset()
const [first, second] = data.searchFields
const count = data.fields.count
const rows = shallowRef<DemoRow[]>(data.createRows())
const columns: Column[] = [
  { field: 'id', title: 'ID', type: 'integer', filterable: false },
  { ...columnOf(data, first), type: 'string' },
  { ...columnOf(data, second), type: 'string' },
  { ...columnOf(data, count), type: 'integer' }
]
const searchLabel = `Search ${columnOf(data, first).title?.toLowerCase()} or ${columnOf(data, second).title?.toLowerCase()}`
const paginate = ref(true)
const accordion = ref(true)
// The table emits `update:query` as usual; without `v-model:query` it
// applies the change itself. The page only shows what happened.
const last = ref<string>('none yet')
const onQuery = (query: TableQuery, reason: QueryChangeReason) => {
  last.value = `${reason}: page ${query.page}, ${query.filters.length} rule(s)${query.search ? `, search "${query.search}"` : ''}`
}
const detailQuery = makeQuery({ pageSize: 10 })
const detailColumns = data.detail.columns()
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        <Checkbox v-model="paginate" />
        Pages
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="accordion" />
        One row at a time
      </Label>
      <span class="text-muted-foreground">Last change: {{ last }}</span>
    </div>
    <DataTable
      :columns="columns"
      :rows="rows"
      row-key="id"
      :search="[first, second]"
      :paginate="paginate"
      :pagination="{ pageSizeOptions: [5, 10, 20] }"
      auto-width
      :auto-width-max="240"
      sortable
      filterable
      has-subtable
      :expand-mode="accordion ? 'single' : 'multiple'"
      @update:query="onQuery"
    >
      <template #toolbar="bar">
        <input
          class="mb-2 rounded border px-3 py-2"
          type="search"
          :aria-label="searchLabel"
          :placeholder="searchLabel"
          :value="bar.search"
          @input="bar.setSearch(($event.target as HTMLInputElement).value)"
          @keydown.enter="bar.applySearch()"
        />
      </template>
      <template #filter-menu="menu"><FilterMenu :menu="menu" /></template>
      <template #subtable="{ row }">
        <div class="flex flex-col gap-2 py-2 pl-6">
          <p class="text-sm text-muted-foreground">
            {{ data.detail.title(row) }}
          </p>
          <QueryTable
            :query="detailQuery"
            :columns="detailColumns"
            :rows="data.detail.rows(row)"
            auto-width
            :auto-width-max="240"
            :row-key="data.detail.key"
          />
        </div>
      </template>
      <template #empty>No matches. Try another filter or search.</template>
      <template #error="{ error }">
        <span role="alert"
          >Query error: {{ error.code }} ({{
            error.field ?? error.path ?? 'query'
          }}).</span
        >
      </template>
      <template #pagination="page"><TablePager :page="page" /></template>
    </DataTable>
  </div>
</template>
