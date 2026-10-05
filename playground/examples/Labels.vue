<script setup lang="ts">
import { Button } from '@/ui/button'

import { QueryTable, type Column, type TableLabels } from '../../src/index'
import FilterMenu from '../harness/FilterMenu.vue'
import { createDemoRows, useFakeServer } from '../scenarios'

// Every text the table writes comes from `labels`; here in Turkish. Entries
// left out keep their English defaults. The `city` column has no title: its
// sort button is named by the field. The table has no utility column, so the
// clear-all action lives in the toolbar.
const labels: Partial<TableLabels> = {
  filterInput: column => `${column} filtresi`,
  filterOptions: column => `${column} filtre seçenekleri`,
  boolAll: 'Tümü',
  boolTrue: 'Evet',
  boolFalse: 'Hayır'
}

const columns: Column[] = [
  { field: 'name', title: 'Ad' },
  { field: 'city' },
  { field: 'age', title: 'Yaş', type: 'integer' },
  { field: 'active', title: 'Aktif', type: 'bool' }
]

const { query, result } = useFakeServer(createDemoRows(), { pageSize: 10 })
</script>

<template>
  <QueryTable
    v-model:query="query"
    :columns="columns"
    :rows="result.rows"
    :total-rows="result.totalRows"
    :labels="labels"
    row-key="id"
    sortable
    filterable
  >
    <template #toolbar="toolbar">
      <div class="flex items-center gap-2 pb-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="!toolbar.canClearFilters"
          @click="toolbar.clearFilters()"
        >
          Filtreleri temizle
        </Button>
        <span class="text-sm text-muted-foreground">
          {{ result.totalRows }} kişi
        </span>
      </div>
    </template>
    <template #filter-menu="menu">
      <FilterMenu :menu="menu" />
    </template>
  </QueryTable>
</template>
