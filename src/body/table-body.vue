<script setup lang="ts" generic="T extends object">
import { useSlots } from 'vue'

import type {
  CellContextMenuPayload,
  TableLabels,
  TableSlots
} from '../contract'
import { useCellView } from './use-cell-view'
import type { ColumnEntry } from '../core/use-columns'

const props = defineProps<{
  rows: T[]
  /** The columns to draw, hidden ones already dropped. */
  entries: ColumnEntry[]
  /** Cells a full-width row (subtable, empty) spans. */
  columnCount: number
  hasSubtable: boolean
  hasRightPanel: boolean
  keyOf: (row: T, index: number) => string | number
  isExpanded: (row: T, index: number) => boolean
  toggle: (row: T, index: number) => void
  labels: TableLabels
  /** The consumer listens to `cellContextMenu` (C-28); read at event time. */
  hasContextMenuListener: () => boolean
}>()

const emit = defineEmits<{
  rowRightPanelClick: [row: T]
  cellContextMenu: [payload: CellContextMenuPayload<T>]
}>()

const slots = defineSlots<TableSlots<T>>()
const rawSlots = useSlots()

const { cellText, cellAttrs, hasCellSlot, slotProps, onContextMenu } =
  useCellView<T>({
    slots: rawSlots,
    rows: () => props.rows,
    entries: () => props.entries,
    listening: () => props.hasContextMenuListener(),
    onContextMenu: payload => emit('cellContextMenu', payload)
  })
</script>

<template>
  <tbody @contextmenu="onContextMenu">
    <template v-for="(row, i) in rows" :key="keyOf(row, i)">
      <tr
        :data-row-index="i"
        :data-expanded="isExpanded(row, i) ? '' : undefined"
      >
        <td v-if="hasRightPanel">
          <button
            type="button"
            class="qt-right-panel-button"
            :aria-label="labels.openRightPanel"
            @click.stop="emit('rowRightPanelClick', row)"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </td>
        <td v-if="hasSubtable">
          <button
            type="button"
            class="qt-expand"
            :aria-expanded="isExpanded(row, i)"
            :aria-label="labels.expandRow"
            @click="toggle(row, i)"
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
              <polyline v-if="isExpanded(row, i)" points="6 9 12 15 18 9" />
              <polyline v-else points="9 6 15 12 9 18" />
            </svg>
          </button>
        </td>
        <template v-for="entry in entries" :key="entry.column.field">
          <td v-if="hasCellSlot(entry.column)" v-bind="cellAttrs(entry)">
            <slot
              :name="`cell-${entry.column.field}`"
              v-bind="slotProps(row, entry.column, i)"
            />
          </td>
          <td v-else v-bind="cellAttrs(entry)">
            {{ cellText(row, entry.column) }}
          </td>
        </template>
      </tr>
      <tr v-if="isExpanded(row, i)" class="qt-subtable-row">
        <td :colspan="columnCount">
          <slot name="subtable" :row="row" :row-index="i" />
        </td>
      </tr>
    </template>
    <tr v-if="rows.length === 0 && slots.empty" class="qt-empty-row">
      <td :colspan="columnCount"><slot name="empty" /></td>
    </tr>
  </tbody>
</template>
