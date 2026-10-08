<script setup lang="ts">
import { ref } from 'vue'

import type { HeaderContextMenuPayload } from '@dolusoft/query-table'
import { QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { currentDataset, listColumns, useFakeServer } from '../scenarios'

// Right-click a column header (the label / sort control) to emit
// `headerContextMenu`. The filter row keeps the browser menu (paste,
// spell-check). Utility headers emit nothing.
const data = currentDataset()
const columns = listColumns(data)
const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })
const lastEvent = ref('Right-click a column header.')

const onHeaderContextMenu = (payload: HeaderContextMenuPayload) => {
  lastEvent.value = `headerContextMenu: column "${payload.column.field}" (index ${payload.columnIndex}) at ${payload.event.clientX},${payload.event.clientY}`
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted-foreground">{{ lastEvent }}</p>
    <QueryTable
      v-model:query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      row-key="id"
      sortable
      filterable
      @header-context-menu="onHeaderContextMenu"
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
