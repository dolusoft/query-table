<script setup lang="ts">
import { computed, ref } from 'vue'

import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { createDemoRows, useFakeServer, wideColumns } from '../scenarios'

// `pinned: 'left'` keeps ID and Name at the start while the rest scrolls
// sideways; `pinned: 'right'` keeps a column at the end. The table draws
// left-pinned columns first and right-pinned ones last, and writes
// `data-pinned` (empty on the left, `right` on the right) and the measured
// offset `--qt-pin-left` or `--qt-pin-right` on their cells (the expand cell
// too, with a left-pinned column); `position: sticky`, the layer and the
// background are this page's CSS (the skin). One rule serves both sides,
// since the unset property leaves the other side `auto` (LTR layout):
//
//   .qt-table [data-pinned] {
//     position: sticky;
//     left: var(--qt-pin-left);
//     right: var(--qt-pin-right);
//     z-index: 1;
//     background: var(--background);
//   }
const pinCity = ref(false)
const pinActiveRight = ref(false)
const columns = computed(() =>
  wideColumns().map(column =>
    column.field === 'city' && pinCity.value
      ? { ...column, pinned: 'left' as const }
      : column.field === 'active' && pinActiveRight.value
        ? { ...column, pinned: 'right' as const }
        : column
  )
)
const { query, result } = useFakeServer(createDemoRows(), { pageSize: 20 })
</script>

<template>
  <div class="flex flex-col gap-3">
    <Label class="font-normal text-muted-foreground">
      <Checkbox v-model="pinCity" />
      Pin City too (it moves next to Name)
    </Label>
    <Label class="font-normal text-muted-foreground">
      <Checkbox v-model="pinActiveRight" />
      Pin Active to the right
    </Label>
    <!-- Consumer CSS of this page: the table takes its columns' widths and
         scrolls sideways instead of squeezing them. -->
    <div class="[&_.qt-table]:w-max [&_.qt-table]:min-w-full">
      <QueryTable
        v-model:query="query"
        :columns="columns"
        :rows="result.rows"
        :total-rows="result.totalRows"
        :pagination="{ pageSizeOptions: [20, 50, 200] }"
        row-key="id"
        sortable
        filterable
        has-subtable
      >
        <template #filter-menu="menu">
          <FilterMenu :menu="menu" />
        </template>
        <!-- The subtable row is one cell over every column, so it scrolls
             sideways with the table. This wrapper sticks to the visible
             edge instead: as wide as the scroller (`cqw`, see the skin)
             minus the cell's padding. -->
        <template #subtable="{ row }">
          <div class="sticky left-2 w-[calc(100cqw-1rem)]">
            Details of {{ row.name }} from {{ row.city }}.
          </div>
        </template>
        <template #pagination="page">
          <TablePager :page="page" />
        </template>
      </QueryTable>
    </div>
  </div>
</template>
