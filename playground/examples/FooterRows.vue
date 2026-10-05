<script setup lang="ts">
import { computed } from 'vue'

import { QueryTable } from '../../src/index'
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
  <div class="wide-table">
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
      <template #subtable="{ row }">Details of {{ row.name }}.</template>
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

<style scoped>
/* Consumer CSS of this page: the table takes its columns' widths and
   scrolls sideways instead of squeezing them. */
.wide-table :deep(.qt-table) {
  width: max-content;
  min-width: 100%;
}
</style>
