<script setup lang="ts">
import { computed, defineComponent, h } from 'vue'

import IconFilter from './icon-filter.vue'
import type {
  Column,
  FilterCondition,
  FilterDatetimeSlotProps,
  FilterMenuSlotProps,
  SortDirection,
  TableQuery
} from '../contract'
import { conditionLabel, filterConditions } from '../model/filter-conditions'
import { columnTypeOf, rulesOf } from '../model/query'
import type { FilterDrafts } from '../model/use-filter-drafts'

const props = defineProps<{
  /** Columns to draw: the table has already dropped the hidden ones. */
  columns: Column[]
  query: TableQuery
  sortable: boolean
  filterable: boolean
  hasSubtable: boolean
  hasRightPanel: boolean
  drafts: FilterDrafts
}>()

const emit = defineEmits<{
  sort: [field: string]
  setSort: [field: string, direction: SortDirection]
}>()

defineSlots<{
  'filter-datetime'?(props: FilterDatetimeSlotProps): unknown
  'filter-menu'?(props: FilterMenuSlotProps): unknown
}>()

const isSortable = (column: Column) =>
  props.sortable && column.sortable !== false

const sortOf = (column: Column): SortDirection | null =>
  props.query.sort?.field === column.field ? props.query.sort.direction : null

const isFiltered = (column: Column) =>
  rulesOf(props.query.filters, column.field).length > 0

const hasFilter = (column: Column) =>
  props.filterable && column.filterable !== false

const labelOf = (column: Column) => {
  const label = props.drafts.label(column)
  if (!label) {
    return ''
  }
  const text = conditionLabel(columnTypeOf(column), label.condition)
  return label.count > 1 ? `${text} (${label.count})` : text
}

// A column with several rules shows their count where the value would be.
const inputText = (column: Column) => {
  const count = props.drafts.multiOf(column.field)
  return count > 0 ? `(${count})` : props.drafts.draftOf(column.field).text
}

const isDisabled = (column: Column) => {
  const { condition } = props.drafts.draftOf(column.field)
  return condition === 'IsNull' || condition === 'IsNotNull'
}

const currentCondition = (column: Column): FilterCondition | null =>
  rulesOf(props.query.filters, column.field)[0]?.condition ??
  props.drafts.draftOf(column.field).condition

// One component per column, created once so that a popover wrapped around it
// does not remount the button on every render. It reads reactive state when it
// renders, so it still updates.
const triggers = new Map<string, ReturnType<typeof defineComponent>>()
const triggerFor = (column: Column) => {
  let trigger = triggers.get(column.field)
  if (!trigger) {
    trigger = defineComponent({
      name: 'FilterTrigger',
      setup: () => () =>
        h(
          'button',
          {
            type: 'button',
            class: 'bh-filter-button',
            title: 'Filter options',
            'aria-label': `Filter options for ${column.title ?? column.field}`,
            'data-filtered': isFiltered(column) ? '' : undefined
          },
          [h(IconFilter, { filled: isFiltered(column) })]
        )
    })
    triggers.set(column.field, trigger)
  }
  return trigger
}

const menuProps = (column: Column): FilterMenuSlotProps => ({
  column,
  rules: rulesOf(props.query.filters, column.field),
  condition: currentCondition(column),
  conditions: filterConditions[columnTypeOf(column)],
  setCondition: condition => props.drafts.setCondition(column.field, condition),
  clear: () => props.drafts.clear(column.field),
  sortable: isSortable(column),
  sortDirection: sortOf(column),
  setSort: direction => emit('setSort', column.field, direction),
  trigger: triggerFor(column)
})

const datetimeProps = (column: Column): FilterDatetimeSlotProps => ({
  column,
  value: props.drafts.draftOf(column.field).text,
  updateValue: value => props.drafts.onInput(column.field, value)
})

const inputValue = (event: Event) =>
  (event.target as HTMLInputElement | HTMLSelectElement).value

// A select has no typing: a pick applies at once.
const pick = (field: string, event: Event) => {
  props.drafts.onInput(field, inputValue(event))
  props.drafts.flushField(field)
}

const clearAllEnabled = () =>
  props.query.filters.length > 0 || props.drafts.dirty()

// Right panel first, then subtable; the first one hosts the clear-all button.
const utilities = computed(() =>
  [
    props.hasRightPanel ? 'right-panel' : null,
    props.hasSubtable ? 'subtable' : null
  ].filter(name => name !== null)
)

const ariaSort = (direction: SortDirection | null) =>
  direction === 'asc'
    ? 'ascending'
    : direction === 'desc'
      ? 'descending'
      : undefined
</script>

<template>
  <tr>
    <th v-for="utility in utilities" :key="utility" :data-utility="utility">
      <button
        v-if="filterable && utility === utilities[0]"
        type="button"
        class="bh-clear-all-button"
        title="Clear all filters"
        aria-label="Clear all filters"
        :disabled="!clearAllEnabled()"
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
    <th
      v-for="column in columns"
      :key="column.field"
      :data-field="column.field"
      :data-type="columnTypeOf(column)"
      :data-sort="sortOf(column) ?? undefined"
      :data-sortable="isSortable(column) ? '' : undefined"
      :data-filtered="isFiltered(column) ? '' : undefined"
      :aria-sort="ariaSort(sortOf(column))"
      :style="column.width ? { width: column.width } : undefined"
    >
      <button
        v-if="isSortable(column)"
        type="button"
        class="bh-sort"
        @click="emit('sort', column.field)"
      >
        {{ column.title }}
        <svg
          v-if="sortOf(column) === 'asc'"
          class="bh-sort-icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d="M8 3.5L12.5 9.5H3.5L8 3.5Z" fill="currentColor" />
        </svg>
        <svg
          v-else-if="sortOf(column) === 'desc'"
          class="bh-sort-icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d="M8 12.5L3.5 6.5H12.5L8 12.5Z" fill="currentColor" />
        </svg>
        <svg
          v-else
          class="bh-sort-icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d="M8 3L11.5 7H4.5L8 3Z" fill="currentColor" />
          <path d="M8 13L4.5 9H11.5L8 13Z" fill="currentColor" />
        </svg>
      </button>
      <span v-else class="bh-title">{{ column.title }}</span>

      <div v-if="hasFilter(column)" class="bh-filter">
        <input
          v-if="columnTypeOf(column) === 'string'"
          type="text"
          class="bh-filter-input"
          :aria-label="`Filter ${column.title ?? column.field}`"
          :value="drafts.draftOf(column.field).text"
          :disabled="isDisabled(column)"
          @input="drafts.onInput(column.field, inputValue($event))"
          @keydown.enter="drafts.flushField(column.field)"
        />
        <input
          v-else-if="
            columnTypeOf(column) === 'number' ||
            columnTypeOf(column) === 'integer'
          "
          :type="drafts.multiOf(column.field) ? 'text' : 'number'"
          class="bh-filter-input"
          :aria-label="`Filter ${column.title ?? column.field}`"
          :value="inputText(column)"
          :readonly="drafts.multiOf(column.field) > 0"
          :disabled="isDisabled(column)"
          @input="drafts.onInput(column.field, inputValue($event))"
          @keydown.enter="drafts.flushField(column.field)"
        />
        <template v-else-if="columnTypeOf(column) === 'bool'">
          <select
            class="bh-filter-input"
            :aria-label="`Filter ${column.title ?? column.field}`"
            :value="drafts.draftOf(column.field).text"
            :disabled="drafts.multiOf(column.field) > 0"
            @change="pick(column.field, $event)"
          >
            <option value="">All</option>
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </template>
        <template v-else>
          <slot
            v-if="$slots['filter-datetime']"
            name="filter-datetime"
            v-bind="datetimeProps(column)"
          />
          <input
            v-else
            :type="drafts.multiOf(column.field) ? 'text' : 'date'"
            class="bh-filter-input"
            :aria-label="`Filter ${column.title ?? column.field}`"
            :value="inputText(column)"
            :readonly="drafts.multiOf(column.field) > 0"
            :disabled="isDisabled(column)"
            @input="drafts.onInput(column.field, inputValue($event))"
            @keydown.enter="drafts.flushField(column.field)"
          />
        </template>
        <slot
          v-if="columnTypeOf(column) !== 'bool'"
          name="filter-menu"
          v-bind="menuProps(column)"
        />
        <small v-if="labelOf(column)" class="bh-filter-condition">
          {{ labelOf(column) }}
        </small>
      </div>
    </th>
  </tr>
</template>
