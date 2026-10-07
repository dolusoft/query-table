<script setup lang="ts">
import { ArrowDown, ArrowUp, ArrowUpDown } from '@lucide/vue'

import { Button } from '@/ui/button'
import { QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { currentDataset, listColumns, useFakeServer } from '../scenarios'

// `header-<field>` replaces the label of one header: the cell, its
// `aria-sort`, the filter row and a resize handle stay. The primary column
// draws its own sort button with `toggleSort`; the amount column shows a
// unit under its title and keeps no sort control (the slot replaced the
// table's button), while its filter menu can still sort. Nothing in a slot
// sits inside another button. On a phone the sort buttons are 2.75rem tall
// (playground.css), so the two-line title takes the same minimum height
// (`max-lg:min-h-11`), or its filter row would sit higher than its
// neighbours'.
const data = currentDataset()
const columns = listColumns(data)
const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })
// The sort icon of shadcn-vue's data-table example, from lucide.
const arrow = (direction: 'asc' | 'desc' | null) =>
  direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown
</script>

<template>
  <QueryTable
    v-model:query="query"
    :columns="columns"
    :rows="result.rows"
    :total-rows="result.totalRows"
    row-key="id"
    sortable
    filterable
  >
    <template
      #[`header-${data.fields.primary}`]="{
        column,
        sortDirection,
        sortable,
        toggleSort
      }"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="-ml-2 h-7 gap-1 px-2 font-semibold"
        :disabled="!sortable"
        @click="toggleSort"
      >
        {{ column.title }}
        <component
          :is="arrow(sortDirection)"
          aria-hidden="true"
          class="text-muted-foreground"
        />
      </Button>
    </template>
    <template #[`header-${data.fields.amount}`]="{ column }">
      <span class="flex flex-col justify-center leading-tight max-lg:min-h-11">
        {{ column.title }}
        <small class="font-normal text-muted-foreground">{{
          data.amountUnit
        }}</small>
      </span>
    </template>
    <template #filter-menu="menu">
      <FilterMenu :menu="menu" />
    </template>
    <template #pagination="page">
      <TablePager :page="page" />
    </template>
  </QueryTable>
</template>
