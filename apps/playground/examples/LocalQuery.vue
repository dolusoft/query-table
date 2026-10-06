<script setup lang="ts">
import { defineDataset } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from '@dolusoft/query-table/local'
import { ref, shallowRef } from 'vue'

import { QueryTable, type Column, type TableQuery } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'

interface Person {
  id: number
  name: string
  city: string
  age: number
}

const names = ['Ali', 'ali', 'Çağla', 'Işık', 'İpek', 'Ömer', 'Şule', 'Ümit']
const cities = ['İstanbul', 'Istanbul', 'Ankara', 'İzmir', 'Bursa']
// Fixed-seed LCG: the same source snapshot on every visit.
let seed = 81
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}
const allRows = shallowRef<Person[]>(
  Array.from({ length: 200 }, (_, index) => ({
    id: index + 1,
    name: names[Math.floor(random() * names.length)],
    city: cities[Math.floor(random() * cities.length)],
    age: 18 + Math.floor(random() * 50)
  }))
)
const columns: Column[] = [
  { field: 'id', title: 'ID', type: 'integer', filterable: false },
  { field: 'name', title: 'Name', type: 'string' },
  { field: 'city', title: 'City', type: 'string' },
  { field: 'age', title: 'Age', type: 'integer' }
]
const dataset = defineDataset<Person>({
  key: 'id',
  fields: {
    id: { type: 'integer', filterable: false },
    name: { type: 'string', search: true },
    city: { type: 'string', search: true },
    age: { type: 'integer' }
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
        >{{ local.totalRows.value }} of 200 people match.
        {{ print ? 'Showing every match for printing.' : '' }}</span
      >
    </div>
    <p class="text-sm text-muted-foreground">
      <code>age &gt; 20</code> and <code>age &lt; 40</code> on one field is OR,
      not a bounded range.
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
          aria-label="Search name or city"
          placeholder="Search name or city"
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
