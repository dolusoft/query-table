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
import {
  type Column,
  type ColumnChangeReason,
  QueryTable
} from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { currentDataset, useFakeServer, wideColumns } from '../scenarios'

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
//
// With `reorderable` every header starts with a handle: drag it, or focus it
// and press the arrow keys, Home or End. The table draws no live region, so
// the page announces the new position itself, from `update:columns`.
const data = currentDataset()
const columns = shallowRef<Column[]>(wideColumns(data))
const { query, result } = useFakeServer(data.createRows(), { pageSize: 20 })

const withoutHide = (column: Column): Column => {
  const copy = { ...column }
  delete copy.hide
  return copy
}

/** The columns as the table draws them: left-pinned, the rest, right-pinned. */
const drawn = (list: Column[]) => {
  const shown = list.filter(column => !column.hide)
  return [
    ...shown.filter(column => column.pinned === 'left'),
    ...shown.filter(column => !column.pinned),
    ...shown.filter(column => column.pinned === 'right')
  ]
}

const announcement = shallowRef('')

// Only an order change is announced. The moved column is the one whose
// header holds the focus: a drag and a key focus the handle, and the move
// buttons sit in the same header cell.
const announce = (next: Column[], reason: ColumnChangeReason) => {
  const th = document.activeElement?.closest<HTMLElement>('th[data-field]')
  const list = drawn(next)
  const at = list.findIndex(column => column.field === th?.dataset.field)
  if (reason === 'order' && at >= 0) {
    const name = list[at].title ?? list[at].field
    announcement.value = `${name} moved to position ${at + 1} of ${list.length}`
  }
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
         scrolls sideways instead of squeezing them, and the filter row wraps
         so the column controls can take their own row. In a narrow column
         the skin centres the filter button on the whole filter box; with the
         controls under the input that put it between them, so it is centred
         on the input's row instead (2rem tall, 2.5rem on a touch screen). -->
    <div
      class="[&_.qt-filter]:flex-wrap [&_.qt-filter-button]:top-4 max-lg:[&_.qt-filter-button]:top-5 [&_.qt-table]:w-max [&_.qt-table]:min-w-full"
    >
      <QueryTable
        v-model:query="query"
        v-model:columns="columns"
        :rows="result.rows"
        :total-rows="result.totalRows"
        :pagination="{ pageSizeOptions: [20, 50, 200] }"
        row-key="id"
        sortable
        filterable
        reorderable
        @update:columns="announce"
      >
        <template #filter-menu="menu">
          <FilterMenu :menu="menu" />
          <!-- The column controls take a row of their own under the filter
               (`basis-full` in the wrapping filter row) and wrap inside it:
               on one line they ran past a narrow column and lay over the
               next header's filter. -->
          <div class="flex basis-full flex-wrap gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              :aria-label="
                menu.control.pinned === 'left' ? 'Unpin' : 'Pin left'
              "
              :title="menu.control.pinned === 'left' ? 'Unpin' : 'Pin left'"
              :data-active="menu.control.pinned === 'left' ? '' : undefined"
              class="data-active:bg-muted"
              @click="
                menu.control.pin(
                  menu.control.pinned === 'left' ? false : 'left'
                )
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
          </div>
        </template>
        <template #pagination="page">
          <TablePager :page="page" />
        </template>
      </QueryTable>
    </div>
    <!-- The page's own live region (C-73): the table announces nothing. -->
    <p aria-live="polite" class="sr-only">{{ announcement }}</p>
  </div>
</template>
