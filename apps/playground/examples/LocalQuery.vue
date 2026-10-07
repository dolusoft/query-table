<script setup lang="ts">
import { defineDataset } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from '@dolusoft/query-table/local'
import { ref, shallowRef } from 'vue'

import { QueryTable, type Column, type TableQuery } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { columnOf, currentDataset, type DemoRow } from '../scenarios'

// The whole list is in the page (a fixed-seed snapshot of the selected
// dataset); `useLocalQuery` evaluates the query here with the `tr-1`
// profile, so `ışık` finds "Işık" and `ipek` finds "İpek".
const data = currentDataset()
const [first, second] = data.searchFields
const count = data.fields.count
const allRows = shallowRef<DemoRow[]>(data.createRows())
const columns: Column[] = [
  { field: 'id', title: 'ID', type: 'integer', filterable: false },
  { ...columnOf(data, first), type: 'string' },
  { ...columnOf(data, second), type: 'string' },
  { ...columnOf(data, count), type: 'integer' }
]
const searchLabel = `Search ${columnOf(data, first).title?.toLowerCase()} or ${columnOf(data, second).title?.toLowerCase()}`
const dataset = defineDataset<DemoRow>({
  key: 'id',
  fields: {
    id: { type: 'integer', filterable: false },
    [first]: { type: 'string', search: true },
    [second]: { type: 'string', search: true },
    [count]: { type: 'integer' }
  }
})
const query = ref<TableQuery>({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: []
})
const print = ref(false)
const local = useLocalQuery({
  allRows,
  dataset,
  query,
  profile: 'tr-1',
  paginate: () => !print.value
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="rounded border px-3 py-2"
        :aria-pressed="print"
        @click="print = !print"
      >
        {{ print ? 'Back to pages' : 'Print' }}
      </button>
      <span class="text-sm text-muted-foreground"
        >{{ local.totalRows.value }} of 200 {{ data.noun.many }} match.
        {{ print ? 'Showing every match for printing.' : '' }}</span
      >
    </div>
    <p class="text-sm text-muted-foreground">
      <code>{{ count }} &gt; 20</code> and <code>{{ count }} &lt; 40</code> on
      one field is OR, not a bounded range.
      <a
        class="underline"
        href="https://github.com/dolusoft/query-table/blob/next/docs/guide/semantics.md#composition-and-search"
        >Composition and search</a
      >
    </p>
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
      row-key="id"
      :pagination="{ pageSizeOptions: [5, 10, 20] }"
      sortable
      filterable
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
      <template #empty>No matches. Try another filter or search.</template>
      <template v-if="!print" #pagination="page"
        ><TablePager :page="page"
      /></template>
    </QueryTable>
  </div>
</template>
