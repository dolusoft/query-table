<script setup lang="ts">
import type { Column, FooterRow } from '../contract'
import type { ColumnEntry } from '../core/use-columns'

defineProps<{
  footerRows: FooterRow[]
  entries: ColumnEntry[]
  /** Cells before the first column (right panel, expand button). */
  utilityCount: number
}>()

const footerText = (row: FooterRow, column: Column) =>
  row.cells.find(cell => cell.field === column.field)?.text
</script>

<template>
  <tfoot class="bh-footer">
    <tr v-for="(footerRow, i) in footerRows" :key="i">
      <td v-if="utilityCount > 0" :colspan="utilityCount" />
      <td
        v-for="entry in entries"
        :key="entry.column.field"
        :data-field="entry.column.field"
        :data-type="entry.type"
      >
        {{ footerText(footerRow, entry.column) }}
      </td>
    </tr>
  </tfoot>
</template>
