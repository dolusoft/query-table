<script setup lang="ts">
import { sideOf } from '../columns/column-layout'
import type { Column, FooterRow } from '../contract'
import { columnTypeOf } from '../core/column'
import { pinAttrs } from '../pin/pin'
import type { ColumnEntry } from '../use-query-table'

defineProps<{
  footerRows: FooterRow[]
  entries: ColumnEntry[]
  /** Cells before the first column (right panel, expand button). */
  utilityCount: number
  /** Some column is pinned to the left: the utility cell gets `data-pinned` (C-46). */
  hasPinned: boolean
  /** `--qt-pin-left` or `--qt-pin-right` of each pinned cell, by key (C-47, C-71). */
  offsets: Readonly<Record<string, number>>
}>()

const footerText = (row: FooterRow, column: Column) =>
  row.cells.find(cell => cell.field === column.field)?.text
</script>

<template>
  <tfoot class="qt-footer">
    <tr v-for="(footerRow, i) in footerRows" :key="i">
      <!-- One cell spans the utilities; pinned, it starts at offset 0. -->
      <td
        v-if="utilityCount > 0"
        :colspan="utilityCount"
        v-bind="pinAttrs(hasPinned ? 'left' : false, 0)"
      />
      <td
        v-for="entry in entries"
        :key="entry.column.field"
        :data-field="entry.column.field"
        :data-type="columnTypeOf(entry.column)"
        v-bind="pinAttrs(sideOf(entry.column), offsets[entry.column.field])"
      >
        {{ footerText(footerRow, entry.column) }}
      </td>
    </tr>
  </tfoot>
</template>
