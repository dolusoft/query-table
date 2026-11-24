<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  Funnel,
  GripVertical,
  PanelRight,
  X
} from '@lucide/vue'

import { QueryTable, type SortDirection } from '@dolusoft/query-table'
import { CellCopy, CellPreview } from '@dolusoft/query-table/cells'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { currentDataset, listColumns, useFakeServer } from '../scenarios'

// The table's icons from the page's own set (C-131): one `icon-*` slot per
// icon replaces the built-in `svg` and nothing else. The buttons keep their
// class, their keys and their names from `labels`, so each icon is
// `aria-hidden`. `CellCopy` and `CellPreview` take `icon-copy` and
// `icon-preview` from the table they sit in.
const data = currentDataset()
const [first, second] = data.searchFields
const columns = listColumns(data).map(column => ({
  ...column,
  reorderable: true
}))
const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })

const nameOf = (row: object) => String((row as Record<string, unknown>)[first])
const sortIcon = (direction: SortDirection | false) =>
  direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown
</script>

<template>
  <QueryTable
    v-model:query="query"
    :columns="columns"
    :rows="result.rows"
    :total-rows="result.totalRows"
    auto-width
    :auto-width-max="240"
    row-key="id"
    sortable
    filterable
    reorderable
    has-subtable
    has-right-panel
  >
    <template #icon-sort="{ direction }">
      <component
        :is="sortIcon(direction)"
        class="size-3.5"
        aria-hidden="true"
      />
    </template>
    <template #icon-filter="{ filled }">
      <Funnel
        class="size-3.5"
        :fill="filled ? 'currentColor' : 'none'"
        aria-hidden="true"
      />
    </template>
    <template #icon-clear-all>
      <X class="size-3.5" aria-hidden="true" />
    </template>
    <template #icon-reorder>
      <GripVertical class="size-3.5" aria-hidden="true" />
    </template>
    <template #icon-expand="{ expanded }">
      <component
        :is="expanded ? ChevronDown : ChevronRight"
        class="size-3.5"
        aria-hidden="true"
      />
    </template>
    <template #icon-right-panel>
      <PanelRight class="size-3.5" aria-hidden="true" />
    </template>
    <template #icon-copy>
      <Copy class="size-3.5" aria-hidden="true" />
    </template>
    <template #icon-preview>
      <Eye class="size-3.5" aria-hidden="true" />
    </template>
    <template #[`cell-${first}`]="{ cellValue }">
      <CellCopy :value="String(cellValue)" />
    </template>
    <template #[`cell-${second}`]="{ cellValue }">
      <CellPreview :text="String(cellValue)" />
    </template>
    <template #subtable="{ row }">
      <p class="py-2 pl-6 text-sm text-muted-foreground">
        Details of {{ nameOf(row) }}.
      </p>
    </template>
    <template #filter-menu="menu">
      <FilterMenu :menu="menu" />
    </template>
    <template #pagination="page">
      <TablePager :page="page" />
    </template>
  </QueryTable>
</template>
