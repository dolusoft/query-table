<script setup lang="ts">
import { computed, ref } from 'vue'

import type { Column, ColumnResizePayload } from '../../src/contract'
import { QueryTable } from '../../src/index'
import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { createDemoRows, peopleColumns, useFakeServer } from '../scenarios'

// Drag the line at the right edge of a header, or focus it (Tab) and use the
// arrow keys (Shift for bigger steps); Enter or a double click fits the
// column to its content, Escape cancels a drag. The table emits
// `columnResize` and keeps no width: this page stores the widths (a real
// consumer would save them with the user's view) and writes them back to
// `Column.width`. ID cannot be resized; Age stays between 60 and 160 px.
//
// `table-layout: fixed` (this page's CSS below) makes the header width
// the column width; with the automatic layout, content can override it.
const saved = ref<Record<string, number>>({})
const columns = computed<Column[]>(() =>
  peopleColumns().map(column => {
    const base: Column =
      column.field === 'id'
        ? { ...column, resizable: false }
        : column.field === 'age'
          ? { ...column, width: '100px', minWidth: 60, maxWidth: 160 }
          : { ...column, width: column.width ?? '160px' }
    const width = saved.value[column.field]
    return width ? { ...base, width: `${width}px` } : base
  })
)
const onResize = ({ field, width }: ColumnResizePayload) => {
  saved.value = { ...saved.value, [field]: width }
}
const { query, result } = useFakeServer(createDemoRows(), { pageSize: 10 })
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted-foreground">
      Saved widths:
      <code>{{ JSON.stringify(saved) }}</code>
      <button
        type="button"
        class="ml-2 rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
        @click="saved = {}"
      >
        Reset
      </button>
    </p>
    <div class="wide-table">
      <QueryTable
        v-model:query="query"
        :columns="columns"
        :rows="result.rows"
        :total-rows="result.totalRows"
        row-key="id"
        sortable
        filterable
        resizable
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

<style scoped>
/* Consumer CSS of this page (C-50): with the fixed layout the header width
   is the column width, and the table grows with its columns. */
.wide-table :deep(.qt-table) {
  width: max-content;
  table-layout: fixed;
}
</style>
