<script setup lang="ts">
import { computed } from 'vue'

import { Skeleton } from '@/ui/skeleton'

import { isSkeletonRow } from './skeleton'
import type { CellSlotProps } from '../../src/contract'

// The content of one cell in a `cell-<field>` slot: a bar while the row is a
// placeholder, otherwise the default slot, or the value as plain text (what
// the table draws itself when there is no slot). The bar width varies per
// row and column so the block does not look like a stamped grid.
const props = defineProps<{ cell: CellSlotProps<object> }>()

const widths = ['55%', '75%', '90%', '65%', '80%']
const skeleton = computed(() => isSkeletonRow(props.cell.row))
const width = computed(() => {
  const { column, rowIndex } = props.cell
  if (column.type === 'bool') {
    return '4.5rem'
  }
  const seed = [...column.field].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  )
  return widths[(seed + rowIndex * 3) % widths.length]
})
</script>

<template>
  <!-- h-5 is the line height of a text cell: the row keeps its height. -->
  <div v-if="skeleton" class="flex h-5 items-center" aria-hidden="true">
    <Skeleton
      :class="cell.column.type === 'bool' ? 'h-5 rounded-4xl' : 'h-4'"
      :style="{ width }"
    />
  </div>
  <slot v-else>{{ cell.cellValue ?? '' }}</slot>
</template>
