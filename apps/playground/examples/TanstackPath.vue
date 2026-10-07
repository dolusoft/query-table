<script setup lang="ts">
import {
  dispose,
  filterInputFeature,
  projectServerQuery,
  serverQueryFeature
} from '@dolusoft/query-table-core'
import {
  columnFilteringFeature,
  FlexRender,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable
} from '@tanstack/vue-table'
import { computed, onScopeDispose } from 'vue'

import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/ui/table'
import type { Query } from '@dolusoft/query-table'

import {
  columnOf,
  currentDataset,
  type DemoRow,
  useFakeServer
} from '../scenarios'

// No QueryTable here: shadcn-vue's Table drawn from a TanStack table that
// carries the two plugins of `@dolusoft/query-table-core`. serverQueryFeature
// turns sorting, filtering and paging into `onQueryChange` updates of the
// query the page owns; filterInputFeature gives each column the typed filter
// grammar (`foo*`, `!x`; a number column takes a number). The
// markup, and which TanStack features to
// add, are the page's. `useQueryTable()` sits between the two paths: the
// same table with every feature QueryTable uses, without the markup.
const data = currentDataset()
const { primary, category, count } = data.fields
const titleOf = (field: string) => columnOf(data, field).title ?? field
const { query, result } = useFakeServer(data.createRows(), { pageSize: 8 })

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  serverQueryFeature,
  filterInputFeature
})

// The query as TanStack's slices (sorting, filters, pagination).
const projection = computed(() =>
  projectServerQuery({
    query: query.value,
    rowCount: result.value.totalRows,
    pageRows: result.value.rows.length
  })
)

const table = useTable<typeof features, DemoRow>({
  features,
  columns: [
    { id: primary, accessorKey: primary, header: titleOf(primary) },
    { id: category, accessorKey: category, header: titleOf(category) },
    {
      id: count,
      accessorKey: count,
      header: titleOf(count),
      filterType: 'integer'
    }
  ],
  get data() {
    return result.value.rows
  },
  getRowId: (row: DemoRow) => String(row.id),
  get query() {
    return query.value
  },
  onQueryChange: (next: Query) => {
    query.value = next as typeof query.value
  },
  get rowCount() {
    return result.value.totalRows
  },
  get pageCount() {
    return projection.value.pageCount
  },
  enableSorting: true,
  state: {
    get sorting() {
      return projection.value.state.sorting
    },
    get columnFilters() {
      return projection.value.state.columnFilters
    },
    get pagination() {
      return projection.value.state.pagination
    },
    get globalFilter() {
      return projection.value.state.globalFilter
    }
  }
})

// Pending filter timers stop with the page (C-62).
onScopeDispose(() => dispose(table))

const arrow = (direction: false | 'asc' | 'desc') =>
  direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : ''
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="overflow-x-auto rounded-md border">
      <Table class="tanstack-table">
        <TableHeader>
          <TableRow
            v-for="group in table.getHeaderGroups()"
            :key="group.id"
            class="hover:bg-transparent"
          >
            <TableHead v-for="header in group.headers" :key="header.id">
              <Button
                variant="ghost"
                size="sm"
                class="sort-button -ml-2 min-h-11 lg:pointer-fine:min-h-0"
                @click="header.column.toggleQuerySorting()"
              >
                <FlexRender
                  :render="header.column.columnDef.header"
                  :props="header.getContext()"
                />
                <span aria-hidden="true">{{
                  arrow(header.column.getIsSorted())
                }}</span>
              </Button>
            </TableHead>
          </TableRow>
          <TableRow class="hover:bg-transparent">
            <TableHead
              v-for="column in table.getAllLeafColumns()"
              :key="column.id"
              class="py-1"
            >
              <Input
                class="filter-input h-11 min-w-24 lg:pointer-fine:h-8"
                :aria-label="`Filter ${column.id}`"
                :model-value="column.getFilterInput().text"
                @update:model-value="column.setFilterInput(String($event))"
                @keydown.enter="column.applyFilterInput()"
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
            <TableCell v-for="cell in row.getAllCells()" :key="cell.id">
              {{ cell.getValue() }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="page-info text-sm text-muted-foreground">
        Page {{ query.page }} of {{ projection.pageCount }} ·
        {{ result.totalRows }} rows
      </span>
      <div class="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          class="previous-page min-h-11 lg:pointer-fine:min-h-0"
          :disabled="!table.getCanPreviousPage()"
          @click="table.previousPage()"
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="next-page min-h-11 lg:pointer-fine:min-h-0"
          :disabled="!table.getCanNextPage()"
          @click="table.nextPage()"
        >
          Next
        </Button>
      </div>
    </div>
    <pre class="query-json overflow-x-auto rounded-md bg-muted p-3 text-xs">{{
      JSON.stringify(query, null, 2)
    }}</pre>
  </div>
</template>
