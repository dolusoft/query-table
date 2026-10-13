<script setup lang="ts">
import { computed, ref } from 'vue'

import { Button } from '@/ui/button'
import type { Column, ColumnResizePayload } from '@dolusoft/query-table'
import { QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { currentDataset, listColumns, useFakeServer } from '../scenarios'

// With `autoWidth` every column without a width is drawn at the width its
// content needs (C-100): the table measures after each page arrives and
// writes nothing back. Page through: within one query the widths only grow,
// so a page of short values keeps the columns where they were; a filter is
// another query and measures from scratch. `autoWidthMax` (240 px here) stops
// a long text column from taking the whole row. Resizing a column gives it a
// width, which this page stores; "Reset widths" drops them and the columns go
// back to their automatic width.
const data = currentDataset()
const autoWidth = ref(true)
const saved = ref<Record<string, number>>({})
const columns = computed<Column[]>(() =>
  listColumns(data).map(column => {
    const width = saved.value[column.field]
    return { ...column, width: width ? `${width}px` : undefined }
  })
)
const onResize = ({ field, width }: ColumnResizePayload) => {
  saved.value = { ...saved.value, [field]: width }
}
const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted-foreground">
      Saved widths:
      <code>{{ JSON.stringify(saved) }}</code>
      <Button
        variant="outline"
        size="xs"
        class="ml-2"
        @click="autoWidth = !autoWidth"
      >
        autoWidth: {{ autoWidth ? 'on' : 'off' }}
      </Button>
      <Button variant="outline" size="xs" class="ml-2" @click="saved = {}">
        Reset widths
      </Button>
    </p>
    <!-- Consumer CSS of this page (C-50): with the fixed layout the header
         width is the column width, and the table grows with its columns. -->
    <div
      class="[&_.qt-table]:w-max [&_.qt-table]:min-w-full [&_.qt-table]:table-fixed"
    >
      <QueryTable
        v-model:query="query"
        :columns="columns"
        :rows="result.rows"
        :total-rows="result.totalRows"
        row-key="id"
        sortable
        filterable
        resizable
        :auto-width="autoWidth"
        :auto-width-max="240"
        @column-resize="onResize"
      >
        <template #filter-menu="menu">
          <FilterMenu :menu="menu" />
        </template>
        <template #pagination="page">
          <TablePager :page="page" />
        </template>
      </QueryTable>
    </div>
  </div>
</template>
