<script setup lang="ts">
import type {
  Column,
  ColumnType,
  FilterCondition,
  FilterDatetimeSlotProps,
  FilterMenuSlotProps,
  TableQuery
} from '../contract'
import { conditionLabel, filterConditions } from './filter-conditions'
import { useFilterTrigger } from './use-filter-trigger'
import { rulesOf } from '../core/query'
import { useTableContext } from '../core/table-context'

const props = defineProps<{
  column: Column
  type: ColumnType
  query: TableQuery
}>()

defineSlots<{
  'filter-datetime'?(props: FilterDatetimeSlotProps): unknown
  'filter-menu'?(props: FilterMenuSlotProps): unknown
}>()

const { drafts, sort } = useTableContext()

const isFiltered = () =>
  rulesOf(props.query.filters, props.column.field).length > 0

const trigger = useFilterTrigger({
  column: () => props.column,
  isFiltered
})

const labelOf = () => {
  const label = drafts.label(props.column)
  if (!label) {
    return ''
  }
  const text = conditionLabel(props.type, label.condition)
  return label.count > 1 ? `${text} (${label.count})` : text
}

// A column with several rules shows their count where the value would be.
const inputText = () => {
  const count = drafts.multiOf(props.column.field)
  return count > 0 ? `(${count})` : drafts.draftOf(props.column.field).text
}

const currentCondition = (): FilterCondition | null =>
  rulesOf(props.query.filters, props.column.field)[0]?.condition ??
  drafts.draftOf(props.column.field).condition

const menuProps = (): FilterMenuSlotProps => {
  const { column } = props
  return {
    column,
    rules: rulesOf(props.query.filters, column.field),
    condition: currentCondition(),
    conditions: filterConditions[props.type],
    setCondition: condition => drafts.setCondition(column.field, condition),
    clear: () => drafts.clear(column.field),
    sortable: sort.isSortable(column),
    sortDirection: sort.sortOf(column),
    // `sortBy` does nothing where sorting is off, like a header click (C-07).
    setSort: direction => sort.sortBy(column, direction),
    trigger
  }
}

const datetimeProps = (): FilterDatetimeSlotProps => ({
  column: props.column,
  value: drafts.draftOf(props.column.field).text,
  updateValue: value => drafts.onInput(props.column.field, value)
})

const inputValue = (event: Event) =>
  (event.target as HTMLInputElement | HTMLSelectElement).value

// A select has no typing: a pick applies at once.
const pick = (event: Event) => {
  drafts.onInput(props.column.field, inputValue(event))
  drafts.flushField(props.column.field)
}
</script>

<template>
  <div class="qt-filter">
    <input
      v-if="type === 'string'"
      type="text"
      class="qt-filter-input"
      :aria-label="`Filter ${column.title ?? column.field}`"
      :value="drafts.draftOf(column.field).text"
      @input="drafts.onInput(column.field, inputValue($event))"
      @keydown.enter="drafts.flushField(column.field)"
    />
    <input
      v-else-if="type === 'number' || type === 'integer'"
      :type="drafts.multiOf(column.field) ? 'text' : 'number'"
      class="qt-filter-input"
      :aria-label="`Filter ${column.title ?? column.field}`"
      :value="inputText()"
      :readonly="drafts.multiOf(column.field) > 0"
      @input="drafts.onInput(column.field, inputValue($event))"
      @keydown.enter="drafts.flushField(column.field)"
    />
    <template v-else-if="type === 'bool'">
      <select
        class="qt-filter-input"
        :aria-label="`Filter ${column.title ?? column.field}`"
        :value="drafts.draftOf(column.field).text"
        :disabled="drafts.multiOf(column.field) > 0"
        @change="pick($event)"
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
        v-bind="datetimeProps()"
      />
      <input
        v-else
        :type="drafts.multiOf(column.field) ? 'text' : 'date'"
        class="qt-filter-input"
        :aria-label="`Filter ${column.title ?? column.field}`"
        :value="inputText()"
        :readonly="drafts.multiOf(column.field) > 0"
        @input="drafts.onInput(column.field, inputValue($event))"
        @keydown.enter="drafts.flushField(column.field)"
      />
    </template>
    <slot v-if="type !== 'bool'" name="filter-menu" v-bind="menuProps()" />
    <small v-if="labelOf()" class="qt-filter-condition">
      {{ labelOf() }}
    </small>
  </div>
</template>
