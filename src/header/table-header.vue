<script setup lang="ts">
import { computed } from 'vue'

import type {
  Column,
  FilterDatetimeSlotProps,
  FilterMenuSlotProps,
  TableQuery
} from '../contract'
import { columnTypeOf } from '../core/column'
import { rulesOf } from '../core/query'
import { useTableContext } from '../core/table-context'
import FilterCell from '../filter/filter-cell.vue'
import { ariaSort } from '../sort/sort'
import SortButton from '../sort/sort-button.vue'

const props = defineProps<{
  /** Columns to draw: the table has already dropped the hidden ones. */
  columns: Column[]
  query: TableQuery
  filterable: boolean
  hasSubtable: boolean
  hasRightPanel: boolean
}>()

defineSlots<{
  'filter-datetime'?(props: FilterDatetimeSlotProps): unknown
  'filter-menu'?(props: FilterMenuSlotProps): unknown
}>()

const { drafts, sort, labels } = useTableContext()

const isFiltered = (column: Column) =>
  rulesOf(props.query.filters, column.field).length > 0

const hasFilter = (column: Column) =>
  props.filterable && column.filterable !== false

// Right panel first, then subtable; the first one hosts the clear-all button.
const utilities = computed(() =>
  [
    props.hasRightPanel ? 'right-panel' : null,
    props.hasSubtable ? 'subtable' : null
  ].filter(name => name !== null)
)

const hostsClearAll = (utility: string) =>
  props.filterable && utility === utilities.value[0]
</script>

<template>
  <tr>
    <!-- A utility header cell labels nothing; it is a `th` only when it holds
         the clear-all button, and an empty `td` otherwise (C-45). -->
    <template v-for="utility in utilities" :key="utility">
      <td v-if="!hostsClearAll(utility)" />
      <th v-else scope="col">
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
      :aria-sort="ariaSort(sort.sortOf(column))"
      :style="column.width ? { width: column.width } : undefined"
    >
      <sort-button
        v-if="sort.isSortable(column)"
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
    </th>
  </tr>
</template>
