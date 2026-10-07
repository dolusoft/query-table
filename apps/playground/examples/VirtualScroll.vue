<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'

import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'
import {
  QueryTable,
  type QueryTableExpose,
  type ScrollToIndexOptions,
  type TableQuery,
  type VirtualOptions
} from '@dolusoft/query-table'

import {
  currentDataset,
  listColumns,
  makeQuery,
  queryDemoRows,
  type DemoRow
} from '../scenarios'

// `virtual` draws only the rows in view of the scroll box and `overscan`
// more, between two spacer rows that hold the height of the others. The
// page still gives every row: sorting and filtering run over all of them,
// and the drawn rows keep their index in `rows`. The box is the page's (a
// `max-height` and `overflow-y: auto`); the table finds it as the nearest
// scrolling ancestor. `table-layout: fixed` keeps the column widths from
// following the drawn rows.
const data = currentDataset()
const base = data.createRows()
const columns = listColumns(data)

const count = ref(10_000)
// The dataset has a few hundred rows; the page repeats them under new keys.
const allRows = computed<DemoRow[]>(() =>
  Array.from({ length: count.value }, (_, i) => ({
    ...base[i % base.length],
    id: i + 1
  }))
)
// One page holds every row: the window, not paging, keeps the DOM small.
const query = ref<TableQuery>(makeQuery({ pageSize: count.value }))
watch(count, size => {
  query.value = { ...query.value, page: 1, pageSize: size }
})
const result = computed(() => queryDemoRows(allRows.value, query.value))

const fixedHeight = ref(false)
const virtual = computed<VirtualOptions>(() =>
  fixedHeight.value ? { rowHeight: 41, overscan: 10 } : { overscan: 10 }
)

const table = useTemplateRef<QueryTableExpose>('table')
const target = ref('5000')
const align = ref<NonNullable<ScrollToIndexOptions['align']>>('start')
const jump = () => {
  table.value?.scrollToIndex(Number(target.value) - 1, { align: align.value })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        Rows
        <NativeSelect
          v-model="count"
          size="sm"
          class="[&_select]:h-11 lg:pointer-fine:[&_select]:h-8"
        >
          <NativeSelectOption :value="1000">1 000</NativeSelectOption>
          <NativeSelectOption :value="10000">10 000</NativeSelectOption>
          <NativeSelectOption :value="50000">50 000</NativeSelectOption>
        </NativeSelect>
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="fixedHeight" />
        Fixed row height
      </Label>
      <form class="flex flex-wrap items-center gap-2" @submit.prevent="jump">
        <Label class="font-normal">
          Row
          <Input
            v-model="target"
            class="h-11 w-24 lg:pointer-fine:h-8"
            inputmode="numeric"
            aria-label="Row number"
          />
        </Label>
        <NativeSelect
          v-model="align"
          size="sm"
          aria-label="Align"
          class="[&_select]:h-11 lg:pointer-fine:[&_select]:h-8"
        >
          <NativeSelectOption value="start">start</NativeSelectOption>
          <NativeSelectOption value="center">center</NativeSelectOption>
          <NativeSelectOption value="end">end</NativeSelectOption>
          <NativeSelectOption value="auto">auto</NativeSelectOption>
        </NativeSelect>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          class="min-h-11 lg:pointer-fine:min-h-0"
        >
          Scroll to row
        </Button>
      </form>
    </div>
    <div
      class="virtual-box max-h-[28rem] overflow-y-auto rounded-md [&_.qt-table]:table-fixed"
    >
      <QueryTable
        ref="table"
        v-model:query="query"
        :columns="columns"
        :rows="result.rows"
        :total-rows="result.totalRows"
        :virtual="virtual"
        row-key="id"
        sortable
        filterable
        has-subtable
      >
        <template #subtable="{ row }">
          <p class="text-sm text-muted-foreground">
            {{ data.noun.one }} {{ (row as DemoRow).id }}: an open row is one
            item with its row; the window measures them together.
          </p>
        </template>
      </QueryTable>
    </div>
  </div>
</template>
