<script setup lang="ts">
import { computed } from 'vue'

import { QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import {
  createDemoRows,
  peopleFooter,
  useFakeServer,
  wideColumns
} from '../scenarios'

// `footer-rows` are drawn in a `tfoot`, one cell per visible column. The
// table does not add anything up: the server (here the fake one) sends the
// totals over every row that matches the filters, not just this page.
// ID and Name are pinned: the footer cells under them, and the one cell that
// spans the expand column, stay with them when the table scrolls sideways.
const allRows = createDemoRows()
const columns = wideColumns()
const { query, result } = useFakeServer(allRows, { pageSize: 10 })
const footerRows = computed(() => peopleFooter(allRows, query.value))
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
          Details of {{ row.name }}.
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
