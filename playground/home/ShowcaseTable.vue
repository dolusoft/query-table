<script setup lang="ts">
import { computed, ref } from 'vue'

import { Badge } from '@/ui/badge'
import { Spinner } from '@/ui/spinner'

import type { Column, ColumnResizePayload } from '../../src/contract'
import { QueryTable } from '../../src/index'
import { useCompact } from '../harness/column-filter'
import ColumnFilterSheet from '../harness/ColumnFilterSheet.vue'
import CompactHeader from '../harness/CompactHeader.vue'
import FilterChips from '../harness/FilterChips.vue'
import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import {
  createDemoRows,
  makeQuery,
  orderColumns,
  ordersOf,
  peopleFooter,
  useSlowServer,
  type DemoRow
} from '../scenarios'

// The home page table: one consumer page that uses most of the library at
// once. A fake server with a short delay answers every query; the page owns
// the query, the rows and the column widths, the table draws them.
const allRows = createDemoRows()
const server = useSlowServer(allRows, { pageSize: 10 }, () => 350)
const { query, rows, totalRows, loading } = server

const root = ref<HTMLElement | null>(null)
// Under 640px of its own width: compact headers, filter chips and a sheet.
const compact = useCompact(root)

// Widths the user dragged, written back to `Column.width`.
const saved = ref<Record<string, number>>({})
const onResize = ({ field, width }: ColumnResizePayload) => {
  saved.value = { ...saved.value, [field]: width }
}

// Every column has a width: the fixed layout keeps them still while rows
// change. ID and Name are pinned while there is room for more than them.
const columns = computed<Column[]>(() => {
  const pin = compact.value ? {} : { pinned: 'left' as const }
  const base: Column[] = [
    {
      field: 'id',
      title: 'ID',
      type: 'integer',
      width: '72px',
      resizable: false,
      ...pin
    },
    { field: 'name', title: 'Name', width: '150px', ...pin },
    { field: 'city', title: 'City', width: '130px' },
    {
      field: 'age',
      title: 'Age',
      type: 'integer',
      width: '110px',
      minWidth: 80,
      maxWidth: 200
    },
    { field: 'salary', title: 'Salary', type: 'number', width: '150px' },
    { field: 'joined', title: 'Joined', type: 'date', width: '240px' },
    { field: 'active', title: 'Status', type: 'bool', width: '120px' }
  ]
  return base.map(column => {
    const width = saved.value[column.field]
    return width ? { ...column, width: `${width}px` } : column
  })
})

const money = new Intl.NumberFormat('en-US')
// The server sends the totals over every matching row, not just this page.
const footerRows = computed(() =>
  peopleFooter(allRows, query.value).map(row => ({
    cells: row.cells.map(cell =>
      typeof cell.text === 'number'
        ? { ...cell, text: money.format(cell.text) }
        : cell
    )
  }))
)

const ordersQuery = makeQuery({ pageSize: 10 })

const sheet = ref<{
  open: (field: string, trigger?: HTMLElement | null) => Promise<void>
} | null>(null)
const chips = ref<{ focus: () => HTMLElement | null } | null>(null)
const isFiltered = (field: string) =>
  query.value.filters.some(rule => rule.field === field)
const edit = (field: string, trigger: HTMLElement) =>
  sheet.value?.open(field, trigger)
</script>

<template>
  <!-- Consumer CSS of this page, on the outer table only: it takes its
       columns' widths and scrolls sideways instead of squeezing them. -->
  <div
    ref="root"
    class="[&>.qt-datatable>.qt-table-responsive>.qt-table]:w-max [&>.qt-datatable>.qt-table-responsive>.qt-table]:min-w-full [&>.qt-datatable>.qt-table-responsive>.qt-table]:table-fixed"
    :data-compact="compact ? '' : undefined"
    data-testid="showcase"
  >
    <QueryTable
      v-model:query="query"
      :columns="columns"
      :rows="rows"
      :total-rows="totalRows"
      :loading="loading"
      :footer-rows="footerRows"
      :pagination="{ pageSizeOptions: [10, 25, 50], alwaysShow: true }"
      row-key="id"
      sortable
      :filterable="!compact"
      resizable
      has-subtable
      @column-resize="onResize"
    >
      <template #toolbar>
        <div class="flex flex-col gap-2 pb-2">
          <p class="text-sm text-muted-foreground" aria-live="polite">
            <template v-if="totalRows === null">Loading people…</template>
            <template v-else>
              {{ totalRows }}
              {{ totalRows === 1 ? 'person matches' : 'people match' }}.
            </template>
          </p>
          <FilterChips
            v-if="compact"
            ref="chips"
            v-model:query="query"
            :columns="columns"
            @edit="edit"
          />
        </div>
      </template>
      <template
        v-for="column in compact ? columns : []"
        :key="column.field"
        #[`header-${column.field}`]="header"
      >
        <CompactHeader
          :header="header"
          :filterable="column.filterable !== false"
          :active="isFiltered(column.field)"
          @filter="trigger => edit(column.field, trigger)"
        />
      </template>
      <template #filter-menu="menu">
        <FilterMenu :menu="menu" />
      </template>
      <template #cell-name="{ cellValue }">
        <span class="font-medium">{{ cellValue }}</span>
      </template>
      <template #cell-salary="{ cellValue }">
        {{ money.format(cellValue as number) }}
      </template>
      <template #cell-active="{ cellValue }">
        <Badge :variant="cellValue ? 'secondary' : 'outline'">
          {{ cellValue ? 'Active' : 'Inactive' }}
        </Badge>
      </template>
      <!-- The subtable row is one cell over every column: this wrapper
           sticks to the visible edge while the table scrolls sideways. -->
      <template #subtable="{ row }">
        <div
          class="sticky left-2 flex w-[calc(100cqw-1rem)] flex-col gap-2 py-2"
        >
          <p class="text-sm text-muted-foreground">
            Orders of {{ (row as DemoRow).name }}
          </p>
          <QueryTable
            :query="ordersQuery"
            :columns="orderColumns()"
            :rows="ordersOf((row as DemoRow).id)"
            row-key="orderId"
          />
        </div>
      </template>
      <template #loading>
        <span class="inline-flex items-center gap-2 text-muted-foreground">
          <Spinner />
          Loading…
        </span>
      </template>
      <template #empty>No people match these filters.</template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
    <ColumnFilterSheet
      ref="sheet"
      v-model:query="query"
      :columns="columns"
      :fallback-focus="() => chips?.focus()"
    />
  </div>
</template>
