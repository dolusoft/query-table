<script setup lang="ts">
import { QueryTable } from '../../src/index'
import FilterMenu from '../harness/FilterMenu.vue'
import FilterSheet from '../harness/FilterSheet.vue'
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
  <!-- A fixed layout keeps the columns still while rows change; under 48rem
       the table scrolls sideways instead of squeezing them. Below 640px of
       width the header has no room for a filter row: the page hides it and
       offers the same filters in a panel behind one button. -->
  <div
    class="@container [&_.qt-table]:min-w-[48rem] [&_.qt-table]:table-fixed @max-[640px]:[&_.qt-filter]:hidden"
  >
    <QueryTable
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
        <div class="flex items-center justify-between gap-2 pb-2">
          <p class="text-sm text-muted-foreground">
            {{ result.totalRows }} people match.
          </p>
          <div class="@min-[640px]:hidden">
            <FilterSheet v-model:query="query" :columns="columns" />
          </div>
        </div>
      </template>
      <template #filter-menu="menu">
        <FilterMenu :menu="menu" />
      </template>
      <template #empty>No results.</template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
  </div>
</template>
