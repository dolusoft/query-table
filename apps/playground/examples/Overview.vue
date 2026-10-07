<script setup lang="ts">
import { computed, ref } from 'vue'

import { QueryTable } from '@dolusoft/query-table'

import { useCompact } from '../harness/column-filter'
import ColumnFilterSheet from '../harness/ColumnFilterSheet.vue'
import CompactHeader from '../harness/CompactHeader.vue'
import FilterChips from '../harness/FilterChips.vue'
import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { currentDataset, listColumns, useFakeServer } from '../scenarios'

// A server-backed list: the page owns the query, the fake server answers
// every change with one page of rows and the filtered total.
//
// Below 640px of its own width the page has no room for a filter row: it
// turns the table's `filterable` off and draws, in `header-<field>` slots, a
// sort button (`toggleSort`) and a funnel that opens a sheet for that column.
// Chips above the table show the filters in `query.filters`.
// The date column gets a width: a date input needs more room than an even
// share of the fixed layout, which clipped its placeholder at 768px. ID gets
// 7rem: in the compact header its sort button and funnel (2.75rem each on a
// touch screen) did not fit the scenario's 90px, and the funnel lay under
// the next header.
// In the compact header the other columns take the dataset's widths too: an
// even share of 48rem is narrower than a title like "Severity" with its sort
// button and funnel. The table scrolls sideways there anyway.
const data = currentDataset()
const root = ref<HTMLElement | null>(null)
const compact = useCompact(root)
const columns = computed(() =>
  listColumns(data).map(column =>
    column.field === data.fields.when
      ? { ...column, width: '260px' }
      : column.field === 'id'
        ? { ...column, width: '7rem' }
        : compact.value
          ? { ...column, width: data.columns[column.field]?.width }
          : column
  )
)
const { query, result } = useFakeServer(data.createRows(), {
  sort: { field: data.fields.count, direction: 'asc' }
})

// The exposed members of the sheet and the chips.
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
  <!-- A fixed layout keeps the columns still while rows change; under 48rem
       the table scrolls sideways instead of squeezing them. -->
  <div
    ref="root"
    class="[&_.qt-table]:min-w-[48rem] [&_.qt-table]:table-fixed"
    :data-compact="compact ? '' : undefined"
  >
    <QueryTable
      v-model:query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      row-key="id"
      :pagination="{ pageSizeOptions: [15, 30, 50], alwaysShow: true }"
      sortable
      :filterable="!compact"
    >
      <template #toolbar>
        <div class="flex flex-col gap-2 pb-2">
          <p class="text-sm text-muted-foreground">
            {{ result.totalRows }}
            {{
              result.totalRows === 1
                ? `${data.noun.one} matches`
                : `${data.noun.many} match`
            }}.
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
      <template #empty>No results.</template>
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
