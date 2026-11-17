<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import {
  QueryTable,
  type QueryTableExpose,
  type RowExpansionPayload
} from '@dolusoft/query-table'

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
// `rowExpansionChange` tells the page about each press of an expand button
// (C-122), so it keeps the open rows it needs, for an export say, without
// watching the `subtable` content mount. Calls the page makes itself, such
// as `collapseAll()`, emit nothing: the page updates its own list.
// `expand-mode="single"` makes it an accordion (C-123): opening a row closes
// the open one, and the closed row is told first, so the list never holds
// two rows.
const data = currentDataset()
const columns = listColumns(data)
const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })
const table = ref<QueryTableExpose | null>(null)
const open = ref(new Set<string | number>())
const accordion = ref(false)
const onExpansion = ({ rowKey, expanded }: RowExpansionPayload<DemoRow>) => {
  const next = new Set(open.value)
  if (expanded) {
    next.add(rowKey)
  } else {
    next.delete(rowKey)
  }
  open.value = next
}
const collapseAll = () => {
  table.value?.collapseAll()
  open.value = new Set()
}
// The table closes a row that leaves `rows` (another page) without an event
// (C-26); the page drops it from its list the same way.
watch(
  () => result.value.rows,
  rows => {
    const shown = new Set<string | number>(rows.map(row => row.id))
    open.value = new Set([...open.value].filter(key => shown.has(key)))
  }
)
const openKeys = computed(() => [...open.value].join(', ') || 'none')
const detailQuery = makeQuery({ pageSize: 10 })
const detailColumns = data.detail.columns()
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Button variant="outline" size="sm" @click="collapseAll()">
        Collapse all
      </Button>
      <Label class="font-normal">
        <Checkbox v-model="accordion" />
        One row at a time
      </Label>
      <span class="text-muted-foreground">Open rows: {{ openKeys }}</span>
    </div>
    <QueryTable
      ref="table"
      v-model:query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      auto-width
      :auto-width-max="240"
      row-key="id"
      has-subtable
      :expand-mode="accordion ? 'single' : 'multiple'"
      sortable
      @row-expansion-change="onExpansion"
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
            auto-width
            :auto-width-max="240"
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
