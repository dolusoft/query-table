<script setup lang="ts">
import { computed, ref } from 'vue'

import { Button } from '@/ui/button'

import { QueryTable } from '../../src/index'
import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { createDemoRows, peopleColumns, useSlowServer } from '../scenarios'

// The consumer fetches; the table only draws. `loading` keeps the rows of
// the last answer on screen while the next request runs, so the table does
// not jump. The `loading` slot is a body row: the skin places it over the
// rows (`position: absolute` in a relative `tbody`), the table writes no
// style for it. Sorting, filtering and paging keep working while loading.
const columns = peopleColumns()
const delay = ref(1500)
const hold = ref(false)
const server = useSlowServer(
  createDemoRows(),
  { pageSize: 10 },
  () => delay.value
)
const { query, rows, totalRows } = server
const loading = computed(() => hold.value || server.loading.value)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <label class="flex items-center gap-2">
        Server delay
        <select
          v-model.number="delay"
          class="h-7 rounded-lg border border-input bg-background px-2"
        >
          <option :value="300">300 ms</option>
          <option :value="1500">1500 ms</option>
          <option :value="4000">4000 ms</option>
        </select>
      </label>
      <Button variant="outline" size="sm" @click="server.reload()">
        Reload
      </Button>
      <label class="flex items-center gap-2">
        <input v-model="hold" type="checkbox" />
        Keep loading on
      </label>
      <span class="text-muted-foreground" aria-live="polite">
        {{ loading ? 'Loading…' : `${totalRows ?? 0} people` }}
      </span>
    </div>
    <QueryTable
      v-model:query="query"
      :columns="columns"
      :rows="rows"
      :total-rows="totalRows"
      :loading="loading"
      row-key="id"
      sortable
      filterable
    >
      <template #filter-menu="menu">
        <FilterMenu :menu="menu" />
      </template>
      <template #loading>
        <span class="inline-flex items-center gap-2 text-muted-foreground">
          <svg
            class="size-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.2-8.56" stroke-linecap="round" />
          </svg>
          Loading…
        </span>
      </template>
      <template #empty>No people match.</template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
  </div>
</template>
