<script setup lang="ts">
import { VueServerTable } from '../../src/index'
import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { createDemoRows, peopleColumns, useFakeServer } from '../scenarios'

// A server-backed list: the page owns the query, the fake server answers
// every change with one page of rows and the filtered total.
const columns = peopleColumns()
const { query, result } = useFakeServer(createDemoRows(), {
  sort: { field: 'age', direction: 'asc' }
})
</script>

<template>
  <!-- A fixed layout keeps the columns still while rows change. -->
  <div class="[&_.bh-table]:table-fixed">
    <VueServerTable
      v-model:query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      row-key="id"
      :pagination="{ pageSizeOptions: [15, 30, 50], alwaysShow: true }"
      sortable
      filterable
    >
      <template #toolbar>
        <p class="pb-2 text-sm text-muted-foreground">
          {{ result.totalRows }} people match.
        </p>
      </template>
      <template #filter-menu="menu">
        <FilterMenu :menu="menu" />
      </template>
      <template #empty>No results.</template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </VueServerTable>
  </div>
</template>
