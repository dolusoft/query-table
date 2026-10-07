<script setup lang="ts">
import { computed, ref } from 'vue'

import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import {
  columnOf,
  currentDataset,
  useFakeServer,
  wideColumns
} from '../scenarios'

// `pinned: 'left'` keeps the first two columns at the start while the rest scrolls
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
const data = currentDataset()
const { category, flag, primary } = data.fields
const title = (field: string) => columnOf(data, field).title ?? field
const pinCategory = ref(false)
const pinFlagRight = ref(false)
const columns = computed(() =>
  wideColumns(data).map(column =>
    column.field === category && pinCategory.value
      ? { ...column, pinned: 'left' as const }
      : column.field === flag && pinFlagRight.value
        ? { ...column, pinned: 'right' as const }
        : column
  )
)
const { query, result } = useFakeServer(data.createRows(), { pageSize: 20 })
</script>

<template>
  <div class="flex flex-col gap-3">
    <Label class="font-normal text-muted-foreground">
      <Checkbox v-model="pinCategory" />
      Pin {{ title(category) }} too (it moves next to {{ title(primary) }})
    </Label>
    <Label class="font-normal text-muted-foreground">
      <Checkbox v-model="pinFlagRight" />
      Pin {{ title(flag) }} to the right
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
            {{ data.describe(row) }}
          </div>
        </template>
        <template #pagination="page">
          <TablePager :page="page" />
        </template>
      </QueryTable>
    </div>
  </div>
</template>
