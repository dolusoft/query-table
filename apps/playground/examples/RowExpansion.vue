<script setup lang="ts">
import { ref } from 'vue'

import { Button } from '@/ui/button'
import { QueryTable, type QueryTableExpose } from '@dolusoft/query-table'

import TablePager from '../harness/TablePager.vue'
import {
  currentDataset,
  listColumns,
  makeQuery,
  useFakeServer,
  type DemoRow
} from '../scenarios'

// `has-subtable` adds an expand button per row; the `subtable` slot draws
// under the expanded row. Here it holds a second table with the detail rows
// of that row. `row-key` keeps a row's expansion when the rows reorder;
// `collapseAll()` comes from the template ref.
const data = currentDataset()
const columns = listColumns(data)
const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })
const table = ref<QueryTableExpose | null>(null)
const detailQuery = makeQuery({ pageSize: 10 })
const detailColumns = data.detail.columns()
</script>

<template>
  <div class="flex flex-col gap-3">
    <div>
      <Button variant="outline" size="sm" @click="table?.collapseAll()">
        Collapse all
      </Button>
    </div>
    <QueryTable
      ref="table"
      v-model:query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      row-key="id"
      has-subtable
      sortable
    >
      <template #subtable="{ row }">
        <div class="flex flex-col gap-2 py-2 pl-6">
          <p class="text-sm text-muted-foreground">
            {{ data.detail.title(row as DemoRow) }}
          </p>
          <QueryTable
            :query="detailQuery"
            :columns="detailColumns"
            :rows="data.detail.rows(row as DemoRow)"
            :row-key="data.detail.key"
          />
        </div>
      </template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
  </div>
</template>
