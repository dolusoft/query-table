<script setup lang="ts">
import { rulesOf } from '@dolusoft/query-protocol'

import type {
  Column,
  FilterDatetimeSlotProps,
  FilterMenuSlotProps,
  HeaderSlotProps,
  Query
} from '../contract'
import FilterCell from './filter-cell.vue'
import ResizeHandle from './resize-handle.vue'
import SortButton from './sort-button.vue'
import { columnTypeOf } from '../core/column'
import { useTableContext } from '../core/table-context'
import { pinAttrs, utilityKey, type Utility } from '../pin/pin'
import { ariaSort } from '../sort/sort'

const props = defineProps<{
  /** Columns to draw: hidden ones dropped, pinned ones first. */
  columns: Column[]
  query: Query
  filterable: boolean
  /** Utility cells before the columns, in order. */
  utilities: Utility[]
  /** Pinned cells, utilities included, get `data-pinned` (C-47). */
  hasPinned: boolean
  /** `--qt-pin-left` of each pinned cell, by key. */
  offsets: Readonly<Record<string, number>>
  /**
   * The header slots the consumer gave (`header-<field>`, `filter-datetime`,
   * `filter-menu`), space-separated. The slots below are always passed so
   * that they stay stable; this says which ones to draw.
   */
  slotNames: string
}>()

defineSlots<{
  'filter-datetime'?(props: FilterDatetimeSlotProps): unknown
  'filter-menu'?(props: FilterMenuSlotProps): unknown
  /** Draws the consumer's `header-<field>` slot for `column`. */
  header?(props: HeaderSlotProps): unknown
}>()

const given = (name: string) => props.slotNames.split(' ').includes(name)

const { filters, sort, resize, selection, labels } = useTableContext()

const isFiltered = (column: Column) =>
  rulesOf(props.query.filters, column.field).length > 0

const hasFilter = (column: Column) =>
  props.filterable && column.filterable !== false

// The first utility hosts the clear-all button (C-22); the selection column
// holds its select-all checkbox instead.
const hostsClearAll = (utility: Utility) =>
  props.filterable &&
  utility === props.utilities.find(candidate => candidate !== 'select')

const utilityAttrs = (utility: Utility) =>
  pinAttrs(props.hasPinned, props.offsets[utilityKey(utility)])

// The only inline styles of a header cell: the column width (or the drag
// preview, C-49) and the pin offset (C-47), with `data-pinned`.
const cellAttrs = (column: Column) => {
  const preview = resize.preview.value
  return pinAttrs(
    column.pinned === 'left',
    props.offsets[column.field],
    preview?.field === column.field ? `${preview.width}px` : column.width
  )
}

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
      <th
        v-if="utility === 'select'"
        scope="col"
        v-bind="utilityAttrs(utility)"
      >
        <input
          type="checkbox"
          class="qt-select-all"
          :aria-label="labels().selectAllRows"
          :checked="selection.allSelected.value"
          :indeterminate="selection.someSelected.value"
          @change="
            selection.toggleAll(($event.target as HTMLInputElement).checked)
          "
        />
      </th>
      <td v-else-if="!hostsClearAll(utility)" v-bind="utilityAttrs(utility)" />
      <th v-else scope="col" v-bind="utilityAttrs(utility)">
        <button
          type="button"
          class="qt-clear-all-button"
          :title="labels().clearAllFilters"
          :aria-label="labels().clearAllFilters"
          :disabled="!filters.canClearAll()"
          @click.stop="filters.clearAll()"
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
      :aria-sort="ariaSort(sort.sortOf(column))"
      v-bind="cellAttrs(column)"
    >
      <!-- C-51: the header slot replaces the label only. -->
      <slot
        v-if="given(`header-${column.field}`)"
        name="header"
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
        <template v-if="given('filter-datetime')" #filter-datetime="p">
          <slot name="filter-datetime" v-bind="p" />
        </template>
        <template v-if="given('filter-menu')" #filter-menu="p">
          <slot name="filter-menu" v-bind="p" />
        </template>
      </filter-cell>
      <resize-handle v-if="resize.isResizable(column)" :column="column" />
    </th>
  </tr>
</template>
