<script setup lang="ts">
import { Button } from '@/ui/button'
import {
  QueryTable,
  type Column,
  type FilterCondition,
  type TableLabels
} from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import { currentDataset, useFakeServer } from '../scenarios'

// Every text the table writes comes from `labels`; here in Turkish. Entries
// left out keep their English defaults. The category column has no title:
// its sort button is named by the field. The table has no utility column, so
// the clear-all action lives in the toolbar.
const data = currentDataset()
const { fields, turkish } = data

const conditionNames: Record<FilterCondition, string> = {
  Contains: 'İçerir',
  NotContains: 'İçermez',
  Equal: 'Eşittir (=)',
  NotEqual: 'Eşit değildir (≠)',
  StartsWith: 'İle başlar',
  EndsWith: 'İle biter',
  GreaterThan: 'Büyüktür (>)',
  GreaterThanOrEqual: 'Büyük veya eşittir (≥)',
  LessThan: 'Küçüktür (<)',
  LessThanOrEqual: 'Küçük veya eşittir (≤)'
}

// On a date the same conditions read as time: "after" where a number column
// says "greater than".
const dateConditionNames: Partial<Record<FilterCondition, string>> = {
  GreaterThan: 'Sonra (>)',
  LessThan: 'Önce (<)'
}

// The condition label under an input and the options of the filter menu
// read `filterCondition`, which receives the condition and the column type.
const labels: Partial<TableLabels> = {
  filterInput: column => `${column} filtresi`,
  filterOptions: column => `${column} filtre seçenekleri`,
  filterCondition: (condition, type) =>
    ((type === 'date' || type === 'datetime') &&
      dateConditionNames[condition]) ||
    conditionNames[condition],
  boolAll: 'Tümü',
  boolTrue: 'Evet',
  boolFalse: 'Hayır'
}

const columns: Column[] = [
  { field: fields.primary, title: turkish.primary },
  { field: fields.category },
  { field: fields.count, title: turkish.count, type: 'integer' },
  { field: fields.flag, title: turkish.flag, type: 'bool' },
  { field: fields.date, title: 'Tarih', type: 'date' }
]

// The menu is the page's own markup, so its texts are the page's too.
const menuTexts = {
  heading: 'Filtre koşulu',
  sortAscending: 'Artan sırala',
  sortDescending: 'Azalan sırala',
  clearFilter: 'Filtreyi temizle'
}

const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })
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
          {{ result.totalRows }} {{ turkish.noun }}
        </span>
      </div>
    </template>
    <template #filter-menu="menu">
      <FilterMenu :menu="menu" :texts="menuTexts" />
    </template>
  </QueryTable>
</template>
