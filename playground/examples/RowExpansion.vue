<script setup lang="ts">
import { ref } from 'vue'

import { Button } from '@/ui/button'
import { QueryTable, type QueryTableExpose } from '@dolusoft/query-table'

import TablePager from '../harness/TablePager.vue'
import {
  createDemoRows,
  makeQuery,
  orderColumns,
  ordersOf,
  peopleColumns,
  useFakeServer,
  type DemoRow
} from '../scenarios'

// `has-subtable` adds an expand button per row; the `subtable` slot draws
// under the expanded row. Here it holds a second table with the person's
// orders. `row-key` keeps a row's expansion when the rows reorder;
// `collapseAll()` comes from the template ref.
const columns = peopleColumns()
const { query, result } = useFakeServer(createDemoRows(), { pageSize: 10 })
const table = ref<QueryTableExpose | null>(null)
const ordersQuery = makeQuery({ pageSize: 10 })
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
        <div class="py-2 pl-6">
          <QueryTable
            :query="ordersQuery"
            :columns="orderColumns()"
            :rows="ordersOf((row as DemoRow).id)"
            row-key="orderId"
          />
        </div>
      </template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
  </div>
</template>
