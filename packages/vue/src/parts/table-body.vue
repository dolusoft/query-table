<script setup lang="ts" generic="T extends object">
import { computed, onBeforeUpdate, useSlots } from 'vue'

import { useCellView } from '../body/use-cell-view'
import { sideOf } from '../columns/column-layout'
import type {
  CellContextMenuPayload,
  LoadMoreSlotProps,
  TableLabels,
  TableSlots
} from '../contract'
import { tableRow, type RowCell, type RowUtilities } from './table-row'
import { columnTypeOf } from '../core/column'
import type { FlashView } from '../flash/use-change-flash'
import { pinAttrs, utilityKey } from '../pin/pin'
import type { ColumnEntry } from '../use-query-table'
import type {
  BodyItem,
  DrawnRow,
  GroupRow,
  SpacerRow
} from '../virtual/use-row-window'

const props = defineProps<{
  rows: T[]
  /**
   * The rows in drawing order: pinned top, the others, pinned bottom (C-74);
   * with `virtual` only the drawn ones, between spacers (C-83); with
   * `groupBy` a group row above the first row of each group (C-103).
   */
  bodyRows: Array<BodyItem<T>>
  /** Pin a row or unpin it (C-74). */
  pinRow: (row: T, index: number, position: 'top' | 'bottom' | false) => void
  /** The consumer is fetching: no empty row, the `loading` row instead (C-52). */
  loading: boolean
  /** The columns to draw, hidden ones already dropped. */
  entries: ColumnEntry[]
  /**
   * The names of the slots the body is given, space separated. Slots are not
   * reactive; a slot that comes or goes changes this text (K311-3).
   */
  slotNames: string
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
  /** The row can expand: no expand button otherwise (C-98). */
  canExpand: (row: T, index: number) => boolean
  isExpanded: (row: T, index: number) => boolean
  toggle: (row: T, index: number) => void
  /** `data-row-kind` of a row (C-97); absent, no row carries it. */
  rowKind?: (row: T, index: number) => string | null | undefined
  labels: TableLabels
  /** The consumer listens to `cellContextMenu` (C-28); read at event time. */
  hasContextMenuListener: () => boolean
  /** With `infinite`: what the `load-more` slot receives, else `null` (C-89). */
  loadMore: LoadMoreSlotProps | null
  /**
   * With `flash`: the marks and the binding hook (C-94), else `null`; off,
   * the body draws what it drew in 3.2 and calls nothing per row (C-95).
   */
  flash: FlashView | null
  /** With `scrollBody`: the ARIA table roles of C-102. */
  roles?: boolean
}>()

const emit = defineEmits<{
  rowRightPanelClick: [row: T]
  cellContextMenu: [payload: CellContextMenuPayload<T>]
}>()

const slots = defineSlots<TableSlots<T>>()
/**
 * The body's slots object: the same object for the life of the body, whose
 * functions Vue replaces before each render. Every row gets it as a prop and
 * calls the latest `cell-<field>` function when it renders (K311-3).
 */
const rawSlots = useSlots()

const { onContextMenu } = useCellView<T>({
  rows: () => props.rows,
  entries: () => props.entries,
  listening: () => props.hasContextMenuListener(),
  onContextMenu: payload => emit('cellContextMenu', payload)
})

/** `role` of a row and of a cell with `scrollBody` (C-102). */
const rowRole = () => (props.roles ? 'row' : undefined)
const cellRole = () => (props.roles ? 'cell' : undefined)
/** A cell over every column; with `scrollBody` also its `aria-colspan`. */
const spanAttrs = () => ({
  colspan: props.columnCount,
  role: cellRole(),
  'aria-colspan': props.roles ? props.columnCount : undefined
})

/*
  The cells every row draws, kept by value (K311-2): `entries` is a new
  array of new entries after a change of `rows` (TanStack's column getters
  read its options), so a cell keeps its object while its column (by
  identity), place, type, pinning, slot and role are the same, and the
  array is the previous one when every cell is. A row compares this array
  by identity.
*/
const cells = computed<readonly RowCell[]>(previous => {
  const names = new Set(props.slotNames.split(' '))
  const role = cellRole()
  let same = previous?.length === props.entries.length
  const next = props.entries.map((entry, i): RowCell => {
    const { column } = entry
    const field = column.field
    // The type of a column, read once per change of the columns (C-82).
    const type = columnTypeOf(column)
    const side = sideOf(column)
    const offset = props.offsets[field]
    const slot = names.has(`cell-${field}`) ? `cell-${field}` : null
    const old = previous?.[i]
    if (
      old &&
      old.column === column &&
      old.index === entry.index &&
      old.type === type &&
      old.side === side &&
      old.offset === offset &&
      old.slot === slot &&
      old.role === role
    ) {
      return old
    }
    same = false
    return {
      field,
      column,
      index: entry.index,
      type,
      side,
      offset,
      role,
      slot,
      attrs: {
        role,
        'data-field': field,
        'data-type': type,
        ...pinAttrs(side, offset)
      }
    }
  })
  return same && previous ? previous : next
})

// Utilities are pinned only with a left-pinned column (C-46, C-71); kept by
// value like the cells.
const utilities = computed<RowUtilities>(previous => {
  const role = cellRole()
  const side = props.hasPinned ? 'left' : false
  const offsetOf = (utility: string) => props.offsets[utilityKey(utility)]
  const signature = [
    role,
    side,
    props.hasRightPanel && `p${offsetOf('right-panel')}`,
    props.hasSubtable && `e${offsetOf('subtable')}`,
    props.hasSelection && `s${offsetOf('select')}`
  ].join('|')
  if (previous?.signature === signature) {
    return previous
  }
  const attrs = (on: boolean, utility: string) =>
    on ? { role, ...pinAttrs(side, offsetOf(utility)) } : null
  return {
    panel: attrs(props.hasRightPanel, 'right-panel'),
    expand: attrs(props.hasSubtable, 'subtable'),
    select: attrs(props.hasSelection, 'select'),
    signature
  }
})

const isSpacer = (item: BodyItem<T>): item is SpacerRow => 'spacer' in item
const isGroup = (item: BodyItem<T>): item is GroupRow<T> => 'group' in item
/** A data row: neither a spacer nor a group row. */
const isRow = (item: BodyItem<T>): item is DrawnRow<T> =>
  !isSpacer(item) && !isGroup(item)
/** The identity of a body item in the `v-for`. */
const itemKey = (item: BodyItem<T>) =>
  isRow(item) ? props.keyOf(item.row, item.index) : item.key
/** `data-row-kind` of a drawn row (C-97): no attribute for an empty kind. */
const kindOf = (item: DrawnRow<T>) =>
  props.rowKind ? props.rowKind(item.row, item.index) || undefined : undefined
/** `aria-rowindex` of the subtable row under a drawn row (C-86). */
const nextIndex = (aria: number | undefined) =>
  aria === undefined ? undefined : aria + 1

/*
  Snapshot expansion once per body render (not a live computed). A row's
  `expanded` prop is computed before the subtable `v-if`, and the `group`
  and `subtable` slots run in this render: a consumer slot that writes
  reactive state mid-render can clear TanStack's `expanded` atom before the
  subtable `v-if` runs — chevron flips, detail row never mounts. A computed
  would re-read the cleared atom; this map is filled on first use in the
  render and kept until the next update (K311-7).
*/
let expandedSnapshot: Map<string, boolean> | null = null
onBeforeUpdate(() => {
  expandedSnapshot = null
})
const isRowExpanded = (item: BodyItem<T>) => {
  if (!isRow(item)) {
    return false
  }
  if (!expandedSnapshot) {
    const open = new Map<string, boolean>()
    if (props.hasSubtable) {
      for (const row of props.bodyRows) {
        if (isRow(row)) {
          open.set(
            String(props.keyOf(row.row, row.index)),
            props.isExpanded(row.row, row.index)
          )
        }
      }
    }
    expandedSnapshot = open
  }
  return (
    expandedSnapshot.get(String(props.keyOf(item.row, item.index))) === true
  )
}
</script>

<template>
  <tbody :role="roles ? 'rowgroup' : undefined" @contextmenu="onContextMenu">
    <!--
      Flat `template v-for` children (no nested `<template v-else>` Fragment).
      A nested Fragment left the subtable `tr` vnode created but not inserted
      into `tbody` — chevron flipped, detail row never appeared in the DOM.
      A data row is one `TableRow` (ADR 0017): every prop is a value, so Vue
      skips a row whose values did not change (C-106). No children and no
      directive on it: either would update every row on every render.
    -->
    <template v-for="item in bodyRows" :key="itemKey(item)">
      <tr
        v-if="isSpacer(item)"
        class="qt-virtual-spacer"
        aria-hidden="true"
        :role="rowRole()"
        :style="{ height: `${item.spacer}px` }"
      >
        <td v-bind="spanAttrs()" />
      </tr>
      <tr
        v-else-if="isGroup(item)"
        class="qt-group-row"
        :role="rowRole()"
        :aria-rowindex="item.aria"
      >
        <th
          scope="row"
          :colspan="columnCount"
          :role="roles ? 'rowheader' : undefined"
          :aria-colspan="roles ? columnCount : undefined"
        >
          <slot
            name="group"
            :group-key="item.group.key"
            :count="item.group.count"
            :row="item.group.row"
            :row-index="item.group.index"
            >{{ item.group.key }}</slot
          >
        </th>
      </tr>
      <table-row
        v-else
        :row="item.row"
        :row-key="keyOf(item.row, item.index)"
        :index="item.index"
        :aria="item.aria"
        :pinned="item.pinned"
        :kind="kindOf(item)"
        :selected="hasSelection && isSelected(item.row, item.index)"
        :expanded="isRowExpanded(item)"
        :expandable="hasSubtable && canExpand(item.row, item.index)"
        :flash="flash ? flash.of(keyOf(item.row, item.index)) : undefined"
        :cells="cells"
        :utilities="utilities"
        :label-panel="labels.openRightPanel"
        :label-expand="labels.expandRow"
        :label-select="labels.selectRow"
        :roles="roles"
        :slots="rawSlots"
        :flash-bind="flash ? flash.bind : undefined"
        :pin-row="
          pinRow as (
            row: object,
            index: number,
            position: 'top' | 'bottom' | false
          ) => void
        "
        @toggle="toggle(item.row, item.index)"
        @toggle-selected="toggleSelected(item.row, item.index)"
        @right-panel="emit('rowRightPanelClick', item.row)"
      />
      <tr
        v-if="isRow(item) && isRowExpanded(item)"
        class="qt-subtable-row"
        :role="rowRole()"
        :aria-rowindex="nextIndex(item.aria)"
        :data-pinned-row="item.pinned || undefined"
      >
        <td v-bind="spanAttrs()">
          <slot name="subtable" :row="item.row" :row-index="item.index" />
        </td>
      </tr>
    </template>
    <tr
      v-if="loading && slots.loading"
      class="qt-loading-row"
      :role="rowRole()"
    >
      <td v-bind="spanAttrs()"><slot name="loading" /></td>
    </tr>
    <tr
      v-else-if="!loading && rows.length === 0 && slots.empty"
      class="qt-empty-row"
      :role="rowRole()"
    >
      <td v-bind="spanAttrs()"><slot name="empty" /></td>
    </tr>
    <tr
      v-if="!loading && rows.length > 0 && loadMore && slots['load-more']"
      class="qt-load-more-row"
      :role="rowRole()"
    >
      <td v-bind="spanAttrs()">
        <slot name="load-more" v-bind="loadMore" />
      </td>
    </tr>
  </tbody>
</template>
