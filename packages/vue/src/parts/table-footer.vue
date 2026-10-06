<script setup lang="ts">
import type { Column, FooterRow } from '../contract'
import { pinAttrs } from '../pin/pin'
import type { ColumnEntry } from '../use-query-table'

defineProps<{
  footerRows: FooterRow[]
  entries: ColumnEntry[]
  /** Cells before the first column (right panel, expand button). */
  utilityCount: number
  /** Pinned cells, the utility cell included, get `data-pinned` (C-47). */
  hasPinned: boolean
  /** `--qt-pin-left` of each pinned cell, by key. */
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
        v-bind="pinAttrs(hasPinned, 0)"
      />
      <td
        v-for="entry in entries"
        :key="entry.column.field"
        :data-field="entry.column.field"
        v-bind="
          pinAttrs(entry.column.pinned === 'left', offsets[entry.column.field])
        "
      >
        {{ footerText(footerRow, entry.column) }}
      </td>
    </tr>
  </tfoot>
</template>
