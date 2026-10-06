<script setup lang="ts">
import {
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeOffIcon
} from '@lucide/vue'
import { shallowRef } from 'vue'

import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { type Column, QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { createDemoRows, useFakeServer, wideColumns } from '../scenarios'

// The page owns the layout: `hide`, the order of the array and `pinned`
// live in its `columns`. The buttons next to each filter menu call the
// column's `control`; the table emits a new array with `update:columns` and
// draws nothing new until the page writes it back. `v-model:columns` does
// that: with `:columns` alone the buttons emit and the table keeps the old
// layout. A `shallowRef` keeps the array as given: the table emits a new one
// for every change, so nothing needs to watch its inside.
//
// Hiding is in the header; showing again is the page's own column picker
// above the table, which writes `columns` without `hide`.
const columns = shallowRef<Column[]>(wideColumns())
const { query, result } = useFakeServer(createDemoRows(), { pageSize: 20 })

const withoutHide = (column: Column): Column => {
  const copy = { ...column }
  delete copy.hide
  return copy
}

const setShown = (field: string, on: boolean) => {
  columns.value = columns.value.map(column =>
    column.field === field
      ? on
        ? withoutHide(column)
        : { ...column, hide: true }
      : column
  )
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-x-4 gap-y-2">
      <Label
        v-for="column in columns"
        :key="column.field"
        class="font-normal text-muted-foreground"
      >
        <Checkbox
          :model-value="!column.hide"
          @update:model-value="on => setShown(column.field, on === true)"
        />
        {{ column.title }}
      </Label>
    </div>
    <!-- Consumer CSS of this page: the table takes its columns' widths and
         scrolls sideways instead of squeezing them. -->
    <div class="[&_.qt-table]:w-max [&_.qt-table]:min-w-full">
      <QueryTable
        v-model:query="query"
        v-model:columns="columns"
        :rows="result.rows"
        :total-rows="result.totalRows"
        :pagination="{ pageSizeOptions: [20, 50, 200] }"
        row-key="id"
        sortable
        filterable
      >
        <template #filter-menu="menu">
          <FilterMenu :menu="menu" />
          <Button
            variant="ghost"
            size="icon-xs"
            :aria-label="menu.control.pinned === 'left' ? 'Unpin' : 'Pin left'"
            :title="menu.control.pinned === 'left' ? 'Unpin' : 'Pin left'"
            :data-active="menu.control.pinned === 'left' ? '' : undefined"
            class="data-active:bg-muted"
            @click="
              menu.control.pin(menu.control.pinned === 'left' ? false : 'left')
            "
          >
            <ArrowLeftToLineIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            :aria-label="
              menu.control.pinned === 'right' ? 'Unpin' : 'Pin right'
            "
            :title="menu.control.pinned === 'right' ? 'Unpin' : 'Pin right'"
            :data-active="menu.control.pinned === 'right' ? '' : undefined"
            class="data-active:bg-muted"
            @click="
              menu.control.pin(
                menu.control.pinned === 'right' ? false : 'right'
              )
            "
          >
            <ArrowRightToLineIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Move left"
            title="Move left"
            :disabled="!menu.control.canMoveLeft"
            @click="menu.control.move('left')"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Move right"
            title="Move right"
            :disabled="!menu.control.canMoveRight"
            @click="menu.control.move('right')"
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Hide"
            title="Hide"
            @click="menu.control.hide()"
          >
            <EyeOffIcon />
          </Button>
        </template>
        <template #pagination="page">
          <TablePager :page="page" />
        </template>
      </QueryTable>
    </div>
  </div>
</template>
