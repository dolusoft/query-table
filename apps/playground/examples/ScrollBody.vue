<script setup lang="ts">
import { computed, ref } from 'vue'

import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { QueryTable, type Column } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import {
  currentDataset,
  footerOf,
  useFakeServer,
  wideColumns
} from '../scenarios'

// `scroll-body` draws the header, the body and the footer as three tables in
// `.qt-table-head`, `.qt-table-body` and `.qt-table-foot`. The page makes the
// body scroll (a `max-height` here; the skin gives the wrappers `overflow`),
// so the vertical scrollbar starts below the header and the totals stay in
// view. The body and footer columns take the widths of the header cells, and
// the three scroll sideways together; pinning, resizing and `virtual` work
// as in one table.
const data = currentDataset()
const allRows = data.createRows()
const columns = ref<Column[]>(wideColumns(data))
const { query, result } = useFakeServer(allRows, { pageSize: 100 })
const footerRows = computed(() => footerOf(data, allRows, query.value))

const virtual = ref(false)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        <Checkbox v-model="virtual" />
        Virtual body
      </Label>
    </div>
    <!-- Consumer CSS of this page: the body has a height, and the tables
         take their columns' widths and scroll sideways. -->
    <div
      class="[&_.qt-table]:w-max [&_.qt-table]:min-w-full [&_.qt-table-body]:max-h-[24rem]"
    >
      <QueryTable
        v-model:query="query"
        v-model:columns="columns"
        :rows="result.rows"
        :total-rows="result.totalRows"
        :footer-rows="footerRows"
        :virtual="virtual"
        auto-width
        :auto-width-max="240"
        row-key="id"
        scroll-body
        sortable
        filterable
        resizable
      >
        <template #filter-menu="menu">
          <FilterMenu :menu="menu" />
        </template>
        <template #empty>No results.</template>
      </QueryTable>
    </div>
  </div>
</template>
