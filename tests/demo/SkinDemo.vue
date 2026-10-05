<script setup lang="ts">
import { computed, ref } from 'vue'

import { createDemoRows, queryDemoRows } from './fake-server'
import type { Column, TableQuery } from '../../src/contract'
import TestTable from '../support/harness/TestTable.vue'

const columns: Column[] = [
  { field: 'id', title: 'ID', type: 'number', width: '90px' },
  { field: 'name', title: 'Name' },
  { field: 'city', title: 'City' },
  { field: 'age', title: 'Age', type: 'number' },
  { field: 'salary', title: 'Salary', type: 'number' },
  { field: 'joined', title: 'Joined', type: 'date' }
]
const allRows = createDemoRows()
const empty = new URLSearchParams(location.search).get('state') === 'empty'
const query = ref<TableQuery>({
  page: 1,
  pageSize: 15,
  sort: { field: 'age', direction: 'asc' },
  filters: empty ? [{ field: 'name', condition: 'Contains', value: 'zzz' }] : []
})
const result = computed(() => queryDemoRows(allRows, query.value))
const update = (next: TableQuery) => {
  query.value = next
}
</script>

<template>
  <main class="p-8 [&_.bh-table]:table-fixed">
    <TestTable
      :query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      row-key="id"
      :pagination="{ pageSizeOptions: [15, 30, 50], alwaysShow: true }"
      sortable
      filterable
      @update:query="update"
    />
  </main>
</template>
