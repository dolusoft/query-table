<script setup lang="ts">
import { computed } from 'vue'

import { VueServerTable } from '../../src/index'
import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import {
  createDemoRows,
  peopleColumns,
  peopleFooter,
  useFakeServer
} from '../scenarios'

// `footer-rows` are drawn in a `tfoot`, one cell per visible column. The
// table does not add anything up: the server (here the fake one) sends the
// totals over every row that matches the filters, not just this page.
const allRows = createDemoRows()
const columns = peopleColumns()
const { query, result } = useFakeServer(allRows, { pageSize: 10 })
const footerRows = computed(() => peopleFooter(allRows, query.value))
</script>

<template>
  <VueServerTable
    v-model:query="query"
    :columns="columns"
    :rows="result.rows"
    :total-rows="result.totalRows"
    :footer-rows="footerRows"
    row-key="id"
    filterable
  >
    <template #filter-menu="menu">
      <FilterMenu :menu="menu" />
    </template>
    <template #empty>No results.</template>
    <template #pagination="page">
      <TablePager :page="page" />
    </template>
  </VueServerTable>
</template>
