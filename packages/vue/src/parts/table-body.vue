<script setup lang="ts" generic="T extends object">
import { useSlots } from 'vue'

import { useCellView } from '../body/use-cell-view'
import type {
  CellContextMenuPayload,
  LoadMoreSlotProps,
  TableLabels,
  TableSlots
} from '../contract'
import type { FlashView } from '../flash/use-change-flash'
import { pinAttrs, utilityKey } from '../pin/pin'
import type { ColumnEntry } from '../use-query-table'
import type { DrawnRow, SpacerRow } from '../virtual/use-row-window'

const props = defineProps<{
  rows: T[]
  /**
   * The rows in drawing order: pinned top, the others, pinned bottom (C-74);
   * with `virtual` only the drawn ones, between spacers (C-83).
   */
  bodyRows: Array<DrawnRow<T> | SpacerRow>
  /** Pin a row or unpin it (C-74). */
  pinRow: (row: T, index: number, position: 'top' | 'bottom' | false) => void
  /** The consumer is fetching: no empty row, the `loading` row instead (C-52). */
  loading: boolean
  /** The columns to draw, hidden ones already dropped. */
  entries: ColumnEntry[]
  /** Cells a full-width row (subtable, empty) spans. */
  columnCount: number
  hasSubtable: boolean
  hasRightPanel: boolean
  /** Draw the selection checkbox column (C-59). */
  hasSelection: boolean
  isSelected: (row: T, index: number) => boolean
  toggleSelected: (row: T, index: number) => void
  /** Some column is pinned to the left: the utilities get `data-pinned` (C-46). */
  hasPinned: boolean
  /** `--qt-pin-left` or `--qt-pin-right` of each pinned cell, by key (C-47, C-71). */
  offsets: Readonly<Record<string, number>>
  keyOf: (row: T, index: number) => string | number
  isExpanded: (row: T, index: number) => boolean
  toggle: (row: T, index: number) => void
  labels: TableLabels
  /** The consumer listens to `cellContextMenu` (C-28); read at event time. */
  hasContextMenuListener: () => boolean
  /** With `infinite`: what the `load-more` slot receives, else `null` (C-89). */
  loadMore: LoadMoreSlotProps | null
  /**
   * With `flash`: the marks and the binding hook (C-94), else `null`; off,
   * the body draws what it drew in 3.2 and calls nothing per row (C-95).
   */
  flash: FlashView<T> | null
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
    offsets: () => props.offsets,
    listening: () => props.hasContextMenuListener(),
    onContextMenu: payload => emit('cellContextMenu', payload),
    pinRow: (row, index, position) => props.pinRow(row, index, position)
  })

// Utilities are pinned only with a left-pinned column (C-46, C-71).
const utilityAttrs = (utility: string) =>
  pinAttrs(props.hasPinned ? 'left' : false, props.offsets[utilityKey(utility)])
const rightPanelAttrs = () => utilityAttrs('right-panel')
const expandAttrs = () => utilityAttrs('subtable')
const selectAttrs = () => utilityAttrs('select')

const isSpacer = (item: DrawnRow<T> | SpacerRow): item is SpacerRow =>
  'spacer' in item
/** `aria-rowindex` of the subtable row under a drawn row (C-86). */
const nextIndex = (aria: number | undefined) =>
  aria === undefined ? undefined : aria + 1
</script>

<template>
  <tbody @contextmenu="onContextMenu">
    <template
      v-for="item in bodyRows"
      :key="isSpacer(item) ? item.key : keyOf(item.row, item.index)"
    >
      <tr
        v-if="isSpacer(item)"
        class="qt-virtual-spacer"
        aria-hidden="true"
        :style="{ height: `${item.spacer}px` }"
      >
        <td :colspan="columnCount" />
      </tr>
      <template v-else>
        <tr
          :data-row-index="item.index"
          :aria-rowindex="item.aria"
          :data-pinned-row="item.pinned || undefined"
          :data-expanded="isExpanded(item.row, item.index) ? '' : undefined"
          :data-selected="
            hasSelection && isSelected(item.row, item.index) ? '' : undefined
          "
          :data-flash="flash ? flash.row(item.row, item.index) : undefined"
          :onVnodeBeforeMount="flash ? flash.bind : undefined"
          :onVnodeUpdated="flash ? flash.bind : undefined"
        >
          <td v-if="hasRightPanel" v-bind="rightPanelAttrs()">
            <button
              type="button"
              class="qt-right-panel-button"
              :aria-label="labels.openRightPanel"
              @click.stop="emit('rowRightPanelClick', item.row)"
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
          <td v-if="hasSubtable" v-bind="expandAttrs()">
            <button
              type="button"
              class="qt-expand"
              :aria-expanded="isExpanded(item.row, item.index)"
              :aria-label="labels.expandRow"
              @click="toggle(item.row, item.index)"
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
                <polyline
                  v-if="isExpanded(item.row, item.index)"
                  points="6 9 12 15 18 9"
                />
                <polyline v-else points="9 6 15 12 9 18" />
              </svg>
            </button>
          </td>
          <td v-if="hasSelection" v-bind="selectAttrs()">
            <input
              type="checkbox"
              class="qt-select-row"
              :aria-label="labels.selectRow"
              :checked="isSelected(item.row, item.index)"
              @change="toggleSelected(item.row, item.index)"
            />
          </td>
          <template v-for="entry in entries" :key="entry.column.field">
            <td
              v-if="hasCellSlot(entry.column)"
              v-bind="cellAttrs(entry)"
              :data-flash="
                flash
                  ? flash.cell(item.row, item.index, entry.column.field)
                  : undefined
              "
            >
              <slot
                :name="`cell-${entry.column.field}`"
                v-bind="
                  slotProps(item.row, entry.column, item.index, item.pinned)
                "
              />
            </td>
            <td
              v-else
              v-bind="cellAttrs(entry)"
              :data-flash="
                flash
                  ? flash.cell(item.row, item.index, entry.column.field)
                  : undefined
              "
            >
              {{ cellText(item.row, entry.column) }}
            </td>
          </template>
        </tr>
        <tr
          v-if="isExpanded(item.row, item.index)"
          class="qt-subtable-row"
          :aria-rowindex="nextIndex(item.aria)"
          :data-pinned-row="item.pinned || undefined"
        >
          <td :colspan="columnCount">
            <slot name="subtable" :row="item.row" :row-index="item.index" />
          </td>
        </tr>
      </template>
    </template>
    <tr v-if="loading && slots.loading" class="qt-loading-row">
      <td :colspan="columnCount"><slot name="loading" /></td>
    </tr>
    <tr
      v-else-if="!loading && rows.length === 0 && slots.empty"
      class="qt-empty-row"
    >
      <td :colspan="columnCount"><slot name="empty" /></td>
    </tr>
    <tr
      v-if="!loading && rows.length > 0 && loadMore && slots['load-more']"
      class="qt-load-more-row"
    >
      <td :colspan="columnCount">
        <slot name="load-more" v-bind="loadMore" />
      </td>
    </tr>
  </tbody>
</template>
