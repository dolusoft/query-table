<script setup lang="ts">
import {
  conditionArity,
  conditionOptions,
  rulesOf
} from '@dolusoft/query-protocol'

import type {
  Column,
  ColumnType,
  FilterBound,
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

const { filters, sort, layout, labels } = useTableContext()

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
  const text = labels().filterCondition(label.condition, props.type)
  return label.count > 1 ? `${text} (${label.count})` : text
}

// A column with several rules shows their count where the value would be.
const inputText = () => {
  const count = filters.multiOf(props.column.field)
  return count > 0 ? `(${count})` : filters.draftOf(props.column.field).text
}

const draft = () => filters.draftOf(props.column.field)
const isMulti = () => filters.multiOf(props.column.field) > 0

// Typed text that gives no rule, such as `80,abc` in a number column (C-116).
// While the column still has rules, the text shows them, so it is not marked.
const isInvalid = () =>
  !isFiltered() &&
  !isMulti() &&
  draft().text.trim() !== '' &&
  filters.labelOf(props.column.field)?.count === 0

// Types whose values have an order: the ones `Between` takes.
const ordered: readonly ColumnType[] = ['number', 'integer', 'date', 'datetime']
const isDated = () => props.type === 'date' || props.type === 'datetime'

// A condition without a value has no input to type in: its label says it
// all (C-113). A bool column keeps its select: it has no menu to pick one.
const hidesInput = () => {
  const { condition } = draft()
  return (
    !isMulti() &&
    props.type !== 'bool' &&
    condition !== null &&
    conditionArity(condition) === 0
  )
}

// `Between` takes two inputs, the lower bound first (C-114).
const isRange = () =>
  !isMulti() && draft().condition === 'Between' && ordered.includes(props.type)

const bounds: readonly FilterBound[] = ['lower', 'upper']

const boundText = (bound: FilterBound) =>
  bound === 'upper' ? (draft().text2 ?? '') : draft().text

const boundName = (bound: FilterBound) => {
  const name = columnName(props.column)
  return bound === 'upper'
    ? labels().filterInputTo(name)
    : labels().filterInputFrom(name)
}

// Whether the column type takes `condition`: one of its list, a null
// predicate, or `Between` where values have an order.
const takes = (condition: FilterCondition) =>
  condition === 'Between'
    ? ordered.includes(props.type)
    : conditionArity(condition) === 0 ||
      conditionOptions[props.type].some(option => option.value === condition)

// The column's own list when it has one (C-112), else its type's.
const offered = (): FilterCondition[] => {
  const own = props.column.filterConditions
  return own
    ? [...new Set(own)].filter(takes)
    : conditionOptions[props.type].map(({ value }) => value)
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
    conditions: offered().map(value => ({
      value,
      label: labels().filterCondition(value, props.type)
    })),
    setCondition: condition => filters.setCondition(column.field, condition),
    clear: () => filters.clear(column.field),
    sortable: sort.isSortable(column),
    sortDirection: sort.sortOf(column),
    // `sortBy` does nothing where sorting is off, like a header click (C-07).
    setSort: direction => sort.sortBy(column, direction),
    trigger,
    control: layout.controlOf(column.field)
  }
}

const datetimeProps = (
  bound: FilterBound | null = null
): FilterDatetimeSlotProps => ({
  column: props.column,
  value: bound ? boundText(bound) : draft().text,
  updateValue: value =>
    filters.setInput(props.column.field, value, bound ?? undefined),
  bound
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
    <template v-if="isRange()">
      <template v-for="bound in bounds" :key="bound">
        <slot
          v-if="isDated() && $slots['filter-datetime']"
          name="filter-datetime"
          v-bind="datetimeProps(bound)"
        />
        <input
          v-else
          :type="isDated() ? 'date' : 'number'"
          class="qt-filter-input"
          :aria-label="boundName(bound)"
          :value="boundText(bound)"
          @input="filters.setInput(column.field, inputValue($event), bound)"
          @keydown.enter="filters.apply(column.field)"
        />
      </template>
    </template>
    <template v-else-if="hidesInput()" />
    <input
      v-else-if="type === 'string'"
      type="text"
      class="qt-filter-input"
      :aria-label="inputName()"
      :value="inputText()"
      :readonly="isMulti()"
      :aria-invalid="isInvalid() || undefined"
      @input="filters.setInput(column.field, inputValue($event))"
      @keydown.enter="filters.apply(column.field)"
    />
    <input
      v-else-if="type === 'number' || type === 'integer'"
      type="text"
      class="qt-filter-input"
      :aria-label="inputName()"
      :value="inputText()"
      :readonly="isMulti()"
      :aria-invalid="isInvalid() || undefined"
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
