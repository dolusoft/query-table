<script setup lang="ts">
import {
  conditionLabel,
  conditionOptions,
  rulesOf
} from '@dolusoft/query-protocol'

import type {
  Column,
  ColumnType,
  FilterCondition,
  FilterDatetimeSlotProps,
  FilterMenuSlotProps,
  Query
} from '../contract'
import { columnName } from '../core/labels'
import { useTableContext } from '../core/table-context'
import { useFilterTrigger } from '../filter/use-filter-trigger'

const props = defineProps<{
  column: Column
  type: ColumnType
  query: Query
}>()

defineSlots<{
  'filter-datetime'?(props: FilterDatetimeSlotProps): unknown
  'filter-menu'?(props: FilterMenuSlotProps): unknown
}>()

const { filters, sort, labels } = useTableContext()

const inputName = () => labels().filterInput(columnName(props.column))

const isFiltered = () =>
  rulesOf(props.query.filters, props.column.field).length > 0

const trigger = useFilterTrigger({
  column: () => props.column,
  labels,
  isFiltered
})

const labelOf = () => {
  const label = filters.labelOf(props.column.field)
  if (!label) {
    return ''
  }
  const text = conditionLabel(props.type, label.condition)
  return label.count > 1 ? `${text} (${label.count})` : text
}

// A column with several rules shows their count where the value would be.
const inputText = () => {
  const count = filters.multiOf(props.column.field)
  return count > 0 ? `(${count})` : filters.draftOf(props.column.field).text
}

const currentCondition = (): FilterCondition | null =>
  rulesOf(props.query.filters, props.column.field)[0]?.condition ??
  filters.draftOf(props.column.field).condition

const menuProps = (): FilterMenuSlotProps => {
  const { column } = props
  return {
    column,
    rules: rulesOf(props.query.filters, column.field),
    condition: currentCondition(),
    conditions: conditionOptions[props.type],
    setCondition: condition => filters.setCondition(column.field, condition),
    clear: () => filters.clear(column.field),
    sortable: sort.isSortable(column),
    sortDirection: sort.sortOf(column),
    // `sortBy` does nothing where sorting is off, like a header click (C-07).
    setSort: direction => sort.sortBy(column, direction),
    trigger
  }
}

const datetimeProps = (): FilterDatetimeSlotProps => ({
  column: props.column,
  value: filters.draftOf(props.column.field).text,
  updateValue: value => filters.setInput(props.column.field, value)
})

const inputValue = (event: Event) =>
  (event.target as HTMLInputElement | HTMLSelectElement).value

// A select has no typing: a pick applies at once.
const pick = (event: Event) => {
  filters.setInput(props.column.field, inputValue(event))
  filters.apply(props.column.field)
}
</script>

<template>
  <div class="qt-filter">
    <input
      v-if="type === 'string'"
      type="text"
      class="qt-filter-input"
      :aria-label="inputName()"
      :value="filters.draftOf(column.field).text"
      @input="filters.setInput(column.field, inputValue($event))"
      @keydown.enter="filters.apply(column.field)"
    />
    <input
      v-else-if="type === 'number' || type === 'integer'"
      :type="filters.multiOf(column.field) ? 'text' : 'number'"
      class="qt-filter-input"
      :aria-label="inputName()"
      :value="inputText()"
      :readonly="filters.multiOf(column.field) > 0"
      @input="filters.setInput(column.field, inputValue($event))"
      @keydown.enter="filters.apply(column.field)"
    />
    <template v-else-if="type === 'bool'">
      <select
        class="qt-filter-input"
        :aria-label="inputName()"
        :value="filters.draftOf(column.field).text"
        :disabled="filters.multiOf(column.field) > 0"
        @change="pick($event)"
      >
        <option value="">{{ labels().boolAll }}</option>
        <option value="true">{{ labels().boolTrue }}</option>
        <option value="false">{{ labels().boolFalse }}</option>
      </select>
    </template>
    <template v-else>
      <slot
        v-if="$slots['filter-datetime']"
        name="filter-datetime"
        v-bind="datetimeProps()"
      />
      <input
        v-else
        :type="filters.multiOf(column.field) ? 'text' : 'date'"
        class="qt-filter-input"
        :aria-label="inputName()"
        :value="inputText()"
        :readonly="filters.multiOf(column.field) > 0"
        @input="filters.setInput(column.field, inputValue($event))"
        @keydown.enter="filters.apply(column.field)"
      />
    </template>
    <slot v-if="type !== 'bool'" name="filter-menu" v-bind="menuProps()" />
    <small v-if="labelOf()" class="qt-filter-condition">
      {{ labelOf() }}
    </small>
  </div>
</template>
