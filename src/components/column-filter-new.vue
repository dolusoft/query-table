<template>
  <div class="bh-filter-dropdown-content bh-min-w-[220px]">
    <div class="bh-p-2">
      <!-- Filter Condition -->
      <div class="bh-mb-2">
        <label
          class="bh-text-xs bh-font-medium bh-text-gray-600 dark:bh-text-gray-400 bh-block bh-mb-1"
        >
          Filter Condition
        </label>
        <select
          v-model="selectedCondition"
          class="bh-filter-select bh-w-full bh-px-2.5 bh-py-1.5 bh-text-sm bh-border bh-border-gray-300 dark:bh-border-gray-600 bh-rounded bh-bg-white dark:bh-bg-gray-700 hover:bh-border-primary focus:bh-border-primary focus:bh-ring-1 focus:bh-ring-primary bh-outline-none bh-cursor-pointer bh-transition-colors"
          @change="handleConditionChange"
        >
          <option
            v-for="cond in availableConditions"
            :key="cond.value"
            :value="cond.value"
          >
            {{ cond.icon ? cond.icon + ' ' : '' }}{{ cond.label }}
          </option>
        </select>
      </div>

      <!-- Sort Options (DataTables style) -->
      <div
        v-if="props.column.sort !== false"
        class="bh-border-t bh-border-gray-200 dark:bh-border-gray-600 bh-pt-2 bh-mt-2"
      >
        <label
          class="bh-text-xs bh-font-medium bh-text-gray-600 dark:bh-text-gray-400 bh-block bh-mb-1"
        >
          Sort
        </label>
        <div class="bh-flex bh-flex-col bh-gap-1">
          <button
            type="button"
            class="bh-w-full bh-px-2.5 bh-py-1.5 bh-text-sm bh-text-left bh-rounded bh-transition-colors"
            :class="{
              'bh-bg-primary/10 bh-text-primary': isCurrentSort('asc'),
              'bh-bg-gray-50 dark:bh-bg-gray-700 hover:bh-bg-gray-100 dark:hover:bh-bg-gray-600':
                !isCurrentSort('asc')
            }"
            @click="handleSort('asc')"
          >
            ↑ Sort Ascending
          </button>
          <button
            type="button"
            class="bh-w-full bh-px-2.5 bh-py-1.5 bh-text-sm bh-text-left bh-rounded bh-transition-colors"
            :class="{
              'bh-bg-primary/10 bh-text-primary': isCurrentSort('desc'),
              'bh-bg-gray-50 dark:bh-bg-gray-700 hover:bh-bg-gray-100 dark:hover:bh-bg-gray-600':
                !isCurrentSort('desc')
            }"
            @click="handleSort('desc')"
          >
            ↓ Sort Descending
          </button>
        </div>
      </div>

      <!-- Clear Filter -->
      <div
        class="bh-border-t bh-border-gray-200 dark:bh-border-gray-600 bh-pt-2 bh-mt-2"
      >
        <button
          type="button"
          class="bh-w-full bh-px-2.5 bh-py-1.5 bh-text-sm bh-text-left bh-rounded bh-transition-colors bh-text-red-600 hover:bh-bg-red-50 dark:hover:bh-bg-red-900/20"
          @click="handleClearFilter"
        >
          ✕ Clear Filter
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'columnFilterNew'
}
</script>

<script setup lang="ts">
import { ref, computed } from 'vue'

import { filterConditions } from '../model/filter-conditions'

const props = defineProps([
  'column',
  'currentSortColumn',
  'currentSortDirection'
])
const emit = defineEmits([
  'close',
  'filterChange',
  'sortChange',
  'clearFilter',
  'conditionChange'
])

const selectedCondition = ref(props.column.condition || '')

// Get available conditions based on column type
const availableConditions = computed(() => {
  const type = props.column.type?.toLowerCase() || 'string'
  return filterConditions[type] || filterConditions.string
})

// Handle condition change
const handleConditionChange = (event: Event) => {
  const newValue = (event.target as HTMLSelectElement).value
  selectedCondition.value = newValue

  // Emit condition change to parent for reactivity
  emit('conditionChange', props.column.field, newValue)

  if (newValue === '') {
    props.column.value = ''
  }

  emit('filterChange', props.column)
}

// Check if current column is sorted in given direction
const isCurrentSort = (direction: string) =>
  props.currentSortColumn === props.column.field &&
  props.currentSortDirection === direction

// Handle sort
const handleSort = (direction: string) => {
  emit('sortChange', props.column.field, direction)
  emit('close')
}

// Handle clear filter (reset this column's filter and sort)
const handleClearFilter = () => {
  // Reset condition to default
  const type = props.column.type?.toLowerCase() || 'string'
  props.column.condition = type === 'string' ? 'Contains' : 'Equal'
  props.column.value = ''
  selectedCondition.value = props.column.condition

  emit('clearFilter', props.column)
  emit('close')
}
</script>
