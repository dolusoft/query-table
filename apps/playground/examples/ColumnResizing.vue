<script setup lang="ts">
import { computed, ref } from 'vue'

import { Button } from '@/ui/button'
import type {
  Column,
  ColumnResizePayload,
  QueryTableExpose
} from '@dolusoft/query-table'
import { QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { currentDataset, listColumns, useFakeServer } from '../scenarios'

// Drag the line at the right edge of a header, or focus it (Tab) and use the
// arrow keys (Shift for bigger steps); Enter or a double click fits the
// column to its content, Escape cancels a drag. The table emits
// `columnResize` and keeps no width: this page stores the widths (a real
// consumer would save them with the user's view) and writes them back to
// `Column.width`. ID cannot be resized; the count column stays between 60
// and 160 px. "Fit all to content" asks the table for the width each column
// needs (`measureColumnWidths`, C-96) and stores it the same way, within the
// page's own limits: the table measures, the page decides what to keep.
//
// `table-layout: fixed` (this page's utilities on the wrapper) makes the header width
// the column width; with the automatic layout, content can override it.
const data = currentDataset()
const saved = ref<Record<string, number>>({})
const columns = computed<Column[]>(() =>
  listColumns(data).map(column => {
    const base: Column =
      column.field === 'id'
        ? // 104px instead of the scenario's 90: the skin's wider padding
          // beside the resize handles left 62px of filter box, under the
          // 4rem at which the skin hides the input.
          { ...column, width: '104px', resizable: false }
        : column.field === data.fields.count
          ? { ...column, width: '100px', minWidth: 60, maxWidth: 160 }
          : { ...column, width: column.width ?? '160px' }
    const width = saved.value[column.field]
    return width ? { ...base, width: `${width}px` } : base
  })
)
const onResize = ({ field, width }: ColumnResizePayload) => {
  saved.value = { ...saved.value, [field]: width }
}
const table = ref<QueryTableExpose | null>(null)
const fitAll = () => {
  const next: Record<string, number> = {}
  for (const [field, width] of Object.entries(
    table.value?.measureColumnWidths() ?? {}
  )) {
    if (field === 'id') {
      continue
    }
    next[field] =
      field === data.fields.count ? Math.min(160, Math.max(60, width)) : width
  }
  saved.value = next
}
const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted-foreground">
      Saved widths:
      <code>{{ JSON.stringify(saved) }}</code>
      <Button variant="outline" size="xs" class="ml-2" @click="fitAll">
        Fit all to content
      </Button>
      <Button variant="outline" size="xs" class="ml-2" @click="saved = {}">
        Reset
      </Button>
    </p>
    <!-- Consumer CSS of this page (C-50): with the fixed layout the header
         width is the column width, and the table grows with its columns. -->
    <div
      class="[&_.qt-table]:w-max [&_.qt-table]:min-w-full [&_.qt-table]:table-fixed"
    >
      <QueryTable
        ref="table"
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
