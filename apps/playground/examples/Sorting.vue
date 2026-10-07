<script setup lang="ts">
import type { Column } from '@dolusoft/query-table'
import { QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { currentDataset, listColumns, useFakeServer } from '../scenarios'

// Click a header to sort ascending, again for descending, a third time to
// remove the sort (`sort: null`). The filter menu offers the two directions
// through `setSort`. The category column opts out with `sortable: false`.
// The page is kept: sorting never jumps back to page 1.
const data = currentDataset()
const columns: Column[] = listColumns(data).map(column =>
  column.field === data.fields.category
    ? { ...column, sortable: false }
    : column
)
const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted-foreground">
      Current sort:
      <code>{{
        query.sort ? `${query.sort.field} ${query.sort.direction}` : 'none'
      }}</code>
    </p>
    <QueryTable
      v-model:query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      row-key="id"
      sortable
      filterable
    >
      <template #filter-menu="menu">
        <FilterMenu :menu="menu" />
      </template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
  </div>
</template>
