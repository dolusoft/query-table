<script setup lang="ts">
import { computed, ref } from 'vue'

import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'
import { ScrollArea, ScrollBar } from '@/ui/scroll-area'
import type { QueryChangeReason, TableQuery } from '@dolusoft/query-table'
import { QueryTable, type QueryTableExpose } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import {
  currentDataset,
  listColumns,
  makeQuery,
  queryDemoRows
} from '../scenarios'

// The table is controlled: it draws `query` and emits `update:query` with
// a new query and the reason. `v-model:query` applies every update; here the
// handler is written out so the page can log each one, or ignore it.
const data = currentDataset()
const allRows = data.createRows()
const columns = listColumns(data)
const query = ref<TableQuery>(makeQuery({ pageSize: 5 }))
const result = computed(() => queryDemoRows(allRows, query.value))

const applyUpdates = ref(true)
const filterDebounce = ref(1000)
const log = ref<Array<{ n: number; reason: QueryChangeReason; query: string }>>(
  []
)
let count = 0

const onUpdate = (next: TableQuery, reason: QueryChangeReason) => {
  count += 1
  log.value = [
    { n: count, reason, query: JSON.stringify(next) },
    ...log.value
  ].slice(0, 8)
  if (applyUpdates.value) {
    query.value = next
  }
}

const table = ref<QueryTableExpose | null>(null)
const resetFromOutside = () => {
  // An outside change: the table redraws and emits nothing.
  query.value = makeQuery({ pageSize: 5 })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        <Checkbox v-model="applyUpdates" />
        Apply emitted queries
      </Label>
      <Label class="font-normal">
        filterDebounce
        <NativeSelect v-model="filterDebounce" size="sm">
          <NativeSelectOption :value="0">0</NativeSelectOption>
          <NativeSelectOption :value="100">100</NativeSelectOption>
          <NativeSelectOption :value="1000">1000</NativeSelectOption>
        </NativeSelect>
      </Label>
      <Button variant="outline" size="sm" @click="table?.flushPendingFilters()">
        flushPendingFilters()
      </Button>
      <Button variant="outline" size="sm" @click="resetFromOutside">
        Reset from outside
      </Button>
    </div>
    <QueryTable
      ref="table"
      :query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      :filter-debounce="filterDebounce"
      :pagination="{ pageSizeOptions: [5, 10, 20] }"
      row-key="id"
      sortable
      filterable
      @update:query="onUpdate"
    >
      <template #filter-menu="menu">
        <FilterMenu :menu="menu" />
      </template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
    <div class="grid gap-3 md:grid-cols-2">
      <section>
        <h3 class="pb-1 text-sm font-medium">query (what the page holds)</h3>
        <ScrollArea class="rounded-md border bg-muted/50">
          <pre class="w-max p-3 text-xs">{{
            JSON.stringify(query, null, 2)
          }}</pre>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </section>
      <section>
        <h3 class="pb-1 text-sm font-medium">
          update:query events, newest first
        </h3>
        <ol class="flex flex-col gap-1 text-xs" data-testid="query-log">
          <li v-if="log.length === 0" class="text-muted-foreground">
            Nothing emitted yet: the table is quiet on mount.
          </li>
          <li
            v-for="entry in log"
            :key="entry.n"
            class="rounded-md border p-2 font-mono break-all"
          >
            #{{ entry.n }} <strong>{{ entry.reason }}</strong>
            {{ entry.query }}
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>
