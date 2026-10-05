<script setup lang="ts">
import type { Column, TableQuery } from '../../src/contract'
import TestTable from '../support/harness/TestTable.vue'

const names = [
  'Charlie',
  'Alice',
  'Bob',
  'Dave',
  'Eve',
  'Frank',
  'Grace',
  'Heidi',
  'Ivan',
  'Judy',
  'Mallory',
  'Niaj',
  'Olivia',
  'Peggy',
  'Rupert'
]
const columns: Column[] = [
  { field: 'id', title: 'ID', type: 'number', width: '90px' },
  { field: 'name', title: 'Name' },
  { field: 'city', title: 'City' },
  { field: 'age', title: 'Age', type: 'number' },
  { field: 'salary', title: 'Salary', type: 'number' },
  { field: 'joined', title: 'Joined', type: 'date' }
]
const cities = ['Ankara', 'İstanbul', 'İzmir', 'Bursa', 'Antalya']
const allRows = names.map((name, i) => ({
  id: i + 1,
  name,
  city: cities[i % cities.length],
  age: 22 + ((i * 7) % 30),
  salary: 42000 + ((i * 3517) % 40000),
  joined: `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`
}))
const empty = new URLSearchParams(location.search).get('state') === 'empty'
const rows = empty ? [] : [...allRows].sort((a, b) => a.age - b.age)
const query: TableQuery = {
  page: 1,
  pageSize: 15,
  sort: { field: 'age', direction: 'asc' },
  filters: empty ? [{ field: 'name', condition: 'Contains', value: 'zzz' }] : []
}
</script>

<template>
  <main class="p-8">
    <TestTable
      :query="query"
      :columns="columns"
      :rows="rows"
      :total-rows="empty ? 0 : 48"
      :pagination="{ pageSizeOptions: [15, 30, 50], alwaysShow: true }"
      sortable
      filterable
    />
  </main>
</template>
