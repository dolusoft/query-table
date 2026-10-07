<script setup lang="ts">
import { computed } from 'vue'

import { QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import {
  currentDataset,
  footerOf,
  useFakeServer,
  wideColumns
} from '../scenarios'

// `footer-rows` are drawn in a `tfoot`, one cell per visible column. The
// table does not add anything up: the server (here the fake one) sends the
// totals over every row that matches the filters, not just this page.
// The first two columns are pinned: the footer cells under them, and the one
// cell that spans the expand column, stay with them when the table scrolls
// sideways.
const data = currentDataset()
const allRows = data.createRows()
const columns = wideColumns(data)
const { query, result } = useFakeServer(allRows, { pageSize: 10 })
const footerRows = computed(() => footerOf(data, allRows, query.value))
</script>

<template>
  <!-- Consumer CSS of this page: the table takes its columns' widths and
       scrolls sideways instead of squeezing them. -->
  <div class="[&_.qt-table]:w-max [&_.qt-table]:min-w-full">
    <QueryTable
      v-model:query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      :footer-rows="footerRows"
      row-key="id"
      filterable
      has-subtable
    >
      <!-- Sticks to the visible edge while the table scrolls sideways (see
           the Column pinning page). -->
      <template #subtable="{ row }">
        <div class="sticky left-2 w-[calc(100cqw-1rem)]">
          {{ data.describe(row) }}
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
