<script setup lang="ts">
import { computed, ref } from 'vue'

import { QueryTable } from '../../src/index'
import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { createDemoRows, useFakeServer, wideColumns } from '../scenarios'

// `pinned: 'left'` keeps ID and Name at the start while the rest scrolls
// sideways. The table draws pinned columns first and writes `data-pinned`
// and the measured offset `--qt-pin-left` on their cells (the expand cell
// too); `position: sticky`, the layer and the background are this page's
// CSS (the skin):
//
//   .qt-table [data-pinned] {
//     position: sticky;
//     left: var(--qt-pin-left);
//     z-index: 1;
//     background: var(--background);
//   }
const pinCity = ref(false)
const columns = computed(() =>
  wideColumns().map(column =>
    column.field === 'city' && pinCity.value
      ? { ...column, pinned: 'left' as const }
      : column
  )
)
const { query, result } = useFakeServer(createDemoRows(), { pageSize: 20 })
</script>

<template>
  <div class="flex flex-col gap-3">
    <label class="flex items-center gap-2 text-sm text-muted-foreground">
      <input v-model="pinCity" type="checkbox" class="accent-primary" />
      Pin City too (it moves next to Name)
    </label>
    <div class="wide-table">
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
        <template #subtable="{ row }">
          Details of {{ row.name }} from {{ row.city }}.
        </template>
        <template #pagination="page">
          <TablePager :page="page" />
        </template>
      </QueryTable>
    </div>
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
