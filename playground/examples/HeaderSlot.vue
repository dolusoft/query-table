<script setup lang="ts">
import { Button } from '@/ui/button'

import { QueryTable } from '../../src/index'
import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { createDemoRows, peopleColumns, useFakeServer } from '../scenarios'

// `header-<field>` replaces the label of one header: the cell, its
// `aria-sort`, the filter row and a resize handle stay. Name draws its own
// sort button with `toggleSort`; Salary shows a unit under its title and
// keeps no sort control (the slot replaced the table's button), while its
// filter menu can still sort. Nothing in a slot sits inside another button.
// On a phone the sort buttons are 2.5rem tall (playground.css), so Salary's
// two-line title takes the same minimum height (`max-lg:min-h-10`), or its
// filter row would sit higher than its neighbours'.
const columns = peopleColumns()
const { query, result } = useFakeServer(createDemoRows(), { pageSize: 10 })
const arrow = (direction: 'asc' | 'desc' | null) =>
  direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕'
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
    <template #header-name="{ column, sortDirection, sortable, toggleSort }">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="-ml-2 h-7 gap-1 px-2 font-semibold"
        :disabled="!sortable"
        @click="toggleSort"
      >
        {{ column.title }}
        <span aria-hidden="true" class="text-muted-foreground">{{
          arrow(sortDirection)
        }}</span>
      </Button>
    </template>
    <template #header-salary="{ column }">
      <span class="flex flex-col justify-center leading-tight max-lg:min-h-10">
        {{ column.title }}
        <small class="font-normal text-muted-foreground">TRY, yearly</small>
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
