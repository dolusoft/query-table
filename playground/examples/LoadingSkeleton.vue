<script setup lang="ts">
import { computed, ref } from 'vue'

import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'

import { QueryTable } from '../../src/index'
import FilterMenu from '../harness/FilterMenu.vue'
import { dimWhileLoading, useSkeletonRows } from '../harness/skeleton'
import SkeletonCell from '../harness/SkeletonCell.vue'
import TablePager from '../harness/TablePager.vue'
import { createDemoRows, peopleColumns, useSlowServer } from '../scenarios'

// The table only exposes `loading` (root `data-loading` and `aria-busy`) and
// a `loading` slot. A skeleton is the consumer's markup: placeholder rows go
// in `rows`, and a `cell-<field>` slot draws a bar in their cells, so the
// column widths, pinned columns and row height are the table's own.
//
// First load: no rows yet, so placeholders fill the body. Refetch: the rows of
// the last answer stay and are dimmed, which keeps the page steady; the second
// table can swap them for placeholders instead.
const columns = peopleColumns()
const allRows = createDemoRows()
const delay = ref(1500)
const hold = ref(false)
const refetchStyle = ref<'dim' | 'skeleton'>('dim')

const first = useSlowServer(allRows, { pageSize: 5 }, () => delay.value)
const again = useSlowServer(allRows, { pageSize: 5 }, () => delay.value)

const firstLoading = computed(() => hold.value || first.loading.value)
const againLoading = computed(() => hold.value || again.loading.value)
const firstRows = useSkeletonRows({
  rows: () => first.rows.value,
  loading: () => firstLoading.value,
  pageSize: () => first.query.value.pageSize,
  // A forced loading state stands for a server that never answers.
  replace: () => hold.value
})
const againRows = useSkeletonRows({
  rows: () => again.rows.value,
  loading: () => againLoading.value,
  pageSize: () => again.query.value.pageSize,
  replace: () => refetchStyle.value === 'skeleton'
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="max-w-3xl text-sm text-muted-foreground">
      The library only exposes <code>loading</code> (the root gets
      <code>data-loading</code> and <code>aria-busy</code>) and a
      <code>loading</code> slot. It draws no skeleton: the bars below are this
      page's own markup, in placeholder rows it passes as <code>rows</code> and
      in a <code>cell-&lt;field&gt;</code> slot, so the table's column widths
      and row height keep them in place.
    </p>
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        Server delay
        <NativeSelect v-model="delay" size="sm">
          <NativeSelectOption :value="300">300 ms</NativeSelectOption>
          <NativeSelectOption :value="1500">1500 ms</NativeSelectOption>
          <NativeSelectOption :value="4000">4000 ms</NativeSelectOption>
        </NativeSelect>
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="hold" />
        Keep loading on
      </Label>
    </div>

    <section class="flex flex-col gap-2" aria-label="First load">
      <h3 class="text-sm font-semibold">First load</h3>
      <p class="text-sm text-muted-foreground">
        No rows yet: five placeholder rows, one per row of the page.
      </p>
      <div>
        <Button variant="outline" size="sm" @click="first.reset()">
          Load from empty
        </Button>
      </div>
      <div class="[&_.qt-table]:min-w-[40rem] [&_.qt-table]:table-fixed">
        <QueryTable
          v-model:query="first.query.value"
          :columns="columns"
          :rows="firstRows"
          :total-rows="first.totalRows.value"
          :loading="firstLoading"
          row-key="id"
        >
          <template
            v-for="column in columns"
            :key="column.field"
            #[`cell-${column.field}`]="cell"
          >
            <SkeletonCell :cell="cell" />
          </template>
          <template #empty>No people match.</template>
        </QueryTable>
      </div>
    </section>

    <section class="flex flex-col gap-2" aria-label="Refetch">
      <h3 class="text-sm font-semibold">Refetch with rows on screen</h3>
      <p class="text-sm text-muted-foreground">
        Sort, filter or turn the page: the rows of the last answer stay until
        the next one arrives.
      </p>
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <Label class="font-normal">
          While refetching
          <NativeSelect v-model="refetchStyle" size="sm">
            <NativeSelectOption value="dim">Dim the rows</NativeSelectOption>
            <NativeSelectOption value="skeleton">
              Swap for skeleton rows
            </NativeSelectOption>
          </NativeSelect>
        </Label>
        <Button variant="outline" size="sm" @click="again.reload()">
          Reload
        </Button>
        <span class="text-muted-foreground" aria-live="polite">
          {{
            againLoading ? 'Loading…' : `${again.totalRows.value ?? 0} people`
          }}
        </span>
      </div>
      <div
        :class="dimWhileLoading"
        class="[&_.qt-table]:min-w-[40rem] [&_.qt-table]:table-fixed"
      >
        <QueryTable
          v-model:query="again.query.value"
          :columns="columns"
          :rows="againRows"
          :total-rows="again.totalRows.value"
          :loading="againLoading"
          row-key="id"
          sortable
          filterable
        >
          <template
            v-for="column in columns"
            :key="column.field"
            #[`cell-${column.field}`]="cell"
          >
            <SkeletonCell :cell="cell" />
          </template>
          <template #filter-menu="menu">
            <FilterMenu :menu="menu" />
          </template>
          <template #empty>No people match.</template>
          <template #pagination="page">
            <TablePager :page="page" />
          </template>
        </QueryTable>
      </div>
    </section>
  </div>
</template>
