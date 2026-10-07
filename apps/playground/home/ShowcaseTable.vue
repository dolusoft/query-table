<script setup lang="ts">
import { computed, ref } from 'vue'

import { Badge } from '@/ui/badge'
import type { Column, ColumnResizePayload } from '@dolusoft/query-table'
import { QueryTable } from '@dolusoft/query-table'

import { useCompact } from '../harness/column-filter'
import ColumnFilterSheet from '../harness/ColumnFilterSheet.vue'
import CompactHeader from '../harness/CompactHeader.vue'
import FilterChips from '../harness/FilterChips.vue'
import FilterMenu from '../harness/FilterMenu.vue'
import { dimWhileLoading, useSkeletonRows } from '../harness/skeleton'
import SkeletonCell from '../harness/SkeletonCell.vue'
import TablePager from '../harness/TablePager.vue'
import {
  currentDataset,
  footerOf,
  makeQuery,
  useSlowServer,
  type DemoRow,
  type DemoValue
} from '../scenarios'

// The home page table: one consumer page that uses most of the library at
// once. A fake server with a short delay answers every query; the page owns
// the query, the rows and the column widths, the table draws them. The rows
// are the dataset selected in the header; the home page mounts this table
// again when the choice changes.
const data = currentDataset()
const { fields } = data
const allRows = data.createRows()
const server = useSlowServer(allRows, { pageSize: 10 }, () => 350)
const { query, totalRows, loading } = server
// The first load has no rows yet: placeholder rows with the page size of the
// query fill the body, so it has its final height and column layout. Later
// requests keep the rows of the last answer and dim them (`dimWhileLoading`).
const rows = useSkeletonRows({
  rows: () => server.rows.value,
  loading: () => loading.value,
  pageSize: () => query.value.pageSize
})

const root = ref<HTMLElement | null>(null)
// Under 640px of its own width: compact headers, filter chips and a sheet.
const compact = useCompact(root)

// Widths the user dragged, written back to `Column.width`.
const saved = ref<Record<string, number>>({})
const onResize = ({ field, width }: ColumnResizePayload) => {
  saved.value = { ...saved.value, [field]: width }
}

// Every column has a width: the fixed layout keeps them still while rows
// change. ID and the primary column are pinned while there is room for more
// than them; ID keeps its width, the count column stays within its limits.
const columns = computed<Column[]>(() => {
  const pin = compact.value ? {} : { pinned: 'left' as const }
  const base: Column[] = data.showcase.map((field, index): Column => {
    const column = { ...data.columns[field] }
    const pinned = index < 2 ? pin : {}
    if (field === 'id') {
      return { ...column, resizable: false, ...pinned }
    }
    if (field === fields.count) {
      return { ...column, minWidth: 80, maxWidth: 200, ...pinned }
    }
    return { ...column, ...pinned }
  })
  return base.map(column => {
    const width = saved.value[column.field]
    return width ? { ...column, width: `${width}px` } : column
  })
})

const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
/** The text of a cell: the dataset's format, else numbers with separators. */
const display = (field: string, value: DemoValue | null | undefined) => {
  if (value === null || value === undefined) {
    return ''
  }
  const format = data.format?.[field]
  if (format) {
    return format(value)
  }
  return typeof value === 'number' && field !== 'id'
    ? plain.format(value)
    : String(value)
}

// The server sends the totals over every matching row, not just this page.
// Before the first answer there are no totals: the footer keeps its rows
// (so the table does not grow later) with blank cells. A footer cell takes
// text only, so there is no skeleton bar to draw in it.
const footerRows = computed(() =>
  footerOf(data, allRows, query.value).map(row => ({
    cells: row.cells.map(cell => {
      if (totalRows.value === null) {
        return { ...cell, text: ' ' }
      }
      return typeof cell.text === 'number'
        ? { ...cell, text: display(cell.field, cell.text) }
        : cell
    })
  }))
)

const detailQuery = makeQuery({ pageSize: 10 })
const detailColumns = data.detail.columns()

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
    :class="dimWhileLoading"
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
            <template v-if="totalRows === null">
              Loading {{ data.noun.many }}…
            </template>
            <template v-else>
              {{ totalRows }}
              {{
                totalRows === 1
                  ? `${data.noun.one} matches`
                  : `${data.noun.many} match`
              }}.
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
      <!-- Every column draws through SkeletonCell: a bar on placeholder
           rows, the real content (or the plain value) on the others. -->
      <template
        v-for="column in columns"
        :key="column.field"
        #[`cell-${column.field}`]="cell"
      >
        <SkeletonCell :cell="cell">
          <span v-if="column.field === fields.primary" class="font-medium">
            {{ cell.cellValue }}
          </span>
          <Badge
            v-else-if="column.field === fields.flag"
            :variant="cell.cellValue ? 'secondary' : 'outline'"
          >
            {{ cell.cellValue ? data.flagLabels.on : data.flagLabels.off }}
          </Badge>
          <template v-else>{{
            display(column.field, cell.cellValue as DemoValue | undefined)
          }}</template>
        </SkeletonCell>
      </template>
      <!-- The subtable row is one cell over every column: this wrapper
           sticks to the visible edge while the table scrolls sideways. -->
      <template #subtable="{ row }">
        <div
          class="sticky left-2 flex w-[calc(100cqw-1rem)] flex-col gap-2 py-2"
        >
          <p class="text-sm text-muted-foreground">
            {{ data.detail.title(row as DemoRow) }}
          </p>
          <QueryTable
            :query="detailQuery"
            :columns="detailColumns"
            :rows="data.detail.rows(row as DemoRow)"
            :row-key="data.detail.key"
          />
        </div>
      </template>
      <template #empty>No {{ data.noun.many }} match these filters.</template>
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
