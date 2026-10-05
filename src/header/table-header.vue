<script setup lang="ts">
import { computed } from 'vue'

import type {
  Column,
  FilterDatetimeSlotProps,
  FilterMenuSlotProps,
  HeaderSlotProps,
  TableQuery
} from '../contract'
import { columnTypeOf } from '../core/column'
import { rulesOf } from '../core/query'
import { useTableContext } from '../core/table-context'
import type { Utility } from '../core/use-columns'
import FilterCell from '../filter/filter-cell.vue'
import { pinAttrs } from '../pin/pin'
import { utilityKey } from '../pin/use-header-geometry'
import ResizeHandle from '../resize/resize-handle.vue'
import { ariaSort } from '../sort/sort'
import SortButton from '../sort/sort-button.vue'

const props = defineProps<{
  /** Columns to draw: hidden ones dropped, pinned ones first. */
  columns: Column[]
  query: TableQuery
  filterable: boolean
  /** Utility cells before the columns, in order. */
  utilities: Utility[]
  /** Pinned cells, utilities included, get `data-pinned` (C-47). */
  hasPinned: boolean
  /** `--qt-pin-left` of each pinned cell, by key. */
  offsets: Readonly<Record<string, number>>
}>()

const slots = defineSlots<{
  'filter-datetime'?(props: FilterDatetimeSlotProps): unknown
  'filter-menu'?(props: FilterMenuSlotProps): unknown
  [key: `header-${string}`]: ((props: HeaderSlotProps) => unknown) | undefined
}>()

const { drafts, sort, resize, labels } = useTableContext()

const isFiltered = (column: Column) =>
  rulesOf(props.query.filters, column.field).length > 0

const hasFilter = (column: Column) =>
  props.filterable && column.filterable !== false

// The first utility hosts the clear-all button (C-22).
const hostsClearAll = (utility: Utility) =>
  props.filterable && utility === props.utilities[0]

const utilityAttrs = (utility: Utility) =>
  pinAttrs(props.hasPinned, props.offsets[utilityKey(utility)])

// The only inline styles of a header cell: the column width (or the drag
// preview, C-49) and the pin offset (C-47).
const cellStyle = computed(() => (column: Column) => {
  const preview = resize.preview.value
  const width =
    preview?.field === column.field ? `${preview.width}px` : column.width
  const offset =
    column.pinned === 'left' ? props.offsets[column.field] : undefined
  const style: Record<string, string> = {}
  if (width) {
    style.width = width
  }
  if (offset !== undefined) {
    style['--qt-pin-left'] = `${offset}px`
  }
  return Object.keys(style).length > 0 ? style : undefined
})

const headerSlotProps = (column: Column): HeaderSlotProps => ({
  column,
  sortDirection: sort.sortOf(column),
  sortable: sort.isSortable(column),
  toggleSort: () => {
    sort.sortBy(column)
  }
})
</script>

<template>
  <tr>
    <!-- A utility header cell labels nothing; it is a `th` only when it holds
         the clear-all button, and an empty `td` otherwise (C-45). -->
    <template v-for="utility in utilities" :key="utility">
      <td v-if="!hostsClearAll(utility)" v-bind="utilityAttrs(utility)" />
      <th v-else scope="col" v-bind="utilityAttrs(utility)">
        <button
          type="button"
          class="qt-clear-all-button"
          :title="labels().clearAllFilters"
          :aria-label="labels().clearAllFilters"
          :disabled="!drafts.canClearAll()"
          @click.stop="drafts.clearAll()"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </th>
    </template>
    <th
      v-for="column in columns"
      :key="column.field"
      scope="col"
      :data-field="column.field"
      :data-sort="sort.sortOf(column) ?? undefined"
      :data-sortable="sort.isSortable(column) ? '' : undefined"
      :data-filtered="isFiltered(column) ? '' : undefined"
      :data-pinned="column.pinned === 'left' ? '' : undefined"
      :aria-sort="ariaSort(sort.sortOf(column))"
      :style="cellStyle(column)"
    >
      <!-- C-51: the header slot replaces the label only. -->
      <slot
        v-if="slots[`header-${column.field}`]"
        :name="`header-${column.field}`"
        v-bind="headerSlotProps(column)"
      />
      <sort-button
        v-else-if="sort.isSortable(column)"
        :column="column"
        :direction="sort.sortOf(column)"
        @click="sort.sortBy(column)"
      />
      <span v-else class="qt-title">{{ column.title }}</span>
      <filter-cell
        v-if="hasFilter(column)"
        :column="column"
        :type="columnTypeOf(column)"
        :query="query"
      >
        <template v-if="$slots['filter-datetime']" #filter-datetime="p">
          <slot name="filter-datetime" v-bind="p" />
        </template>
        <template v-if="$slots['filter-menu']" #filter-menu="p">
          <slot name="filter-menu" v-bind="p" />
        </template>
      </filter-cell>
      <resize-handle v-if="resize.isResizable(column)" :column="column" />
    </th>
  </tr>
</template>
