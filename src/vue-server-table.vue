<script setup lang="ts" generic="T extends object">
import { computed, ref, useSlots, watch } from 'vue'

import ColumnHeader from './components/column-header.vue'
import type {
  CellContextMenuPayload,
  CellSlotProps,
  Column,
  TableEmits,
  TableProps,
  TableSlots,
  VueServerTableExpose
} from './contract'
import { columnTypeOf, valueAt } from './core/column'
import { useQueryEmitter } from './core/use-query-emitter'
import { useFilterDrafts } from './filter/use-filter-drafts'
import TablePagination from './pagination/table-pagination.vue'
import { usePagination } from './pagination/use-pagination'
import { useSort } from './sort/use-sort'

defineOptions({ name: 'VueServerTable' })

const props = withDefaults(defineProps<TableProps<T>>(), {
  rows: () => [],
  totalRows: null,
  footerRows: () => [],
  loading: false,
  sortable: false,
  filterable: false,
  filterDebounce: 100,
  pagination: true,
  hasSubtable: false,
  hasRightPanel: false,
  rowKey: undefined,
  truncate: true,
  truncateMaxLength: 150
})

const emit = defineEmits<TableEmits<T>>()

const slots = defineSlots<TableSlots<T>>()
const rawSlots = useSlots()

// ---------------------------------------------------------------------------
// Emitting: the table never writes to its props (see use-query-emitter.ts).
// ---------------------------------------------------------------------------

const { base, update } = useQueryEmitter({
  query: () => props.query,
  emit: (query, reason) => emit('update:query', query, reason)
})

const drafts = useFilterDrafts({
  query: () => props.query,
  base,
  columns: () => props.columns,
  debounce: () => props.filterDebounce,
  update
})

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

const { paginationProps, showPagination } = usePagination({
  props,
  base,
  update,
  flushFilters: () => drafts.flushAll(),
  hasSlot: () => !!slots.pagination
})

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const { sortBy } = useSort({
  sortable: () => props.sortable,
  query: () => props.query,
  base,
  update,
  flushFilters: () => {
    drafts.flushAll()
  }
})

// ---------------------------------------------------------------------------
// Columns and rows
// ---------------------------------------------------------------------------

const visibleColumns = computed(() =>
  props.columns.filter(column => !column.hide)
)

const bodyColumns = computed(() =>
  props.columns
    .map((column, index) => ({ column, index }))
    .filter(entry => !entry.column.hide)
)

const utilityCount = computed(
  () => Number(props.hasSubtable) + Number(props.hasRightPanel)
)

const columnCount = computed(
  () => visibleColumns.value.length + utilityCount.value
)

const cellAttrs = (
  row: T,
  column: Column,
  rowIndex: number,
  columnIndex: number,
  title?: string
) => ({
  'data-field': column.field,
  'data-type': columnTypeOf(column),
  title,
  onContextmenu: (event: MouseEvent) => {
    event.preventDefault()
    const payload: CellContextMenuPayload<T> = {
      event,
      row,
      column,
      cellValue: valueAt(row, column.field),
      rowIndex,
      columnIndex
    }
    emit('cellContextMenu', payload)
  }
})

const hasCellSlot = (column: Column) =>
  !!rawSlots[`cell-${column.field}`] || !!rawSlots.cell

const cellSlotProps = (
  row: T,
  column: Column,
  rowIndex: number
): CellSlotProps<T> => ({
  row,
  rowIndex,
  column,
  cellValue: valueAt(row, column.field)
})

/**
 * Text of a cell, cut when `truncate` is on, and the full text if it was cut.
 * An `html` column is never cut: a cut can leave a tag open, and the full
 * markup is not fit for a `title`.
 */
const cellText = (row: T, column: Column) => {
  // A cell value may be any type; its string form is what the table shows.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const full = String(valueAt(row, column.field) ?? '')
  const cut =
    props.truncate && !column.html && full.length > props.truncateMaxLength
  return {
    text: cut ? full.substring(0, props.truncateMaxLength) + '...' : full,
    title: cut ? full : undefined
  }
}

const footerText = (
  row: { cells: Array<{ field: string; text: string | number }> },
  column: Column
) => row.cells.find(cell => cell.field === column.field)?.text

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

const expanded = ref(new Set<string | number>())

const keyOf = (row: T, index: number): string | number => {
  const { rowKey } = props
  if (typeof rowKey === 'function') {
    return rowKey(row, index)
  }
  if (typeof rowKey === 'string') {
    return (row as Record<string, string | number>)[rowKey]
  }
  return index
}

const isExpanded = (row: T, index: number) =>
  props.hasSubtable && expanded.value.has(keyOf(row, index))

const toggle = (row: T, index: number) => {
  const key = keyOf(row, index)
  if (!expanded.value.delete(key)) {
    expanded.value.add(key)
  }
}

// Without a row identity the state belongs to the rows array it was set on.
// A row may also arrive with `isExpanded` set (print mode opens rows that way).
watch(
  () => props.rows,
  rows => {
    if (props.rowKey === undefined) {
      expanded.value.clear()
    }
    if (!props.hasSubtable) {
      return
    }
    rows.forEach((row, index) => {
      const seeded = (row as { isExpanded?: boolean }).isExpanded
      if (seeded === true) {
        expanded.value.add(keyOf(row, index))
      } else if (seeded === false) {
        expanded.value.delete(keyOf(row, index))
      }
    })
  },
  { immediate: true }
)

const exposed: VueServerTableExpose = {
  collapseAll: () => expanded.value.clear(),
  flushPendingFilters: () => {
    drafts.flushAll()
  }
}
defineExpose(exposed)
</script>

<template>
  <div
    class="bh-datatable"
    :data-loading="loading ? '' : undefined"
    :data-empty="rows.length === 0 ? '' : undefined"
    :data-filtered="query.filters.length > 0 ? '' : undefined"
    :data-sorted="query.sort !== null ? '' : undefined"
  >
    <slot name="toolbar" />
    <div class="bh-table-responsive">
      <table class="bh-table">
        <thead>
          <column-header
            :columns="visibleColumns"
            :query="query"
            :sortable="sortable"
            :filterable="filterable"
            :has-subtable="hasSubtable"
            :has-right-panel="hasRightPanel"
            :drafts="drafts"
            @sort="field => sortBy(field)"
            @set-sort="sortBy"
          >
            <template v-if="rawSlots['filter-datetime']" #filter-datetime="p">
              <slot name="filter-datetime" v-bind="p" />
            </template>
            <template v-if="rawSlots['filter-menu']" #filter-menu="p">
              <slot name="filter-menu" v-bind="p" />
            </template>
          </column-header>
        </thead>
        <tbody>
          <tr v-if="loading && slots.loader" class="bh-loader-row">
            <td :colspan="columnCount"><slot name="loader" /></td>
          </tr>
          <template v-for="(row, i) in rows" :key="keyOf(row, i)">
            <tr
              :data-row-index="i"
              :data-expanded="isExpanded(row, i) ? '' : undefined"
            >
              <td v-if="hasRightPanel" data-utility="right-panel">
                <button
                  type="button"
                  class="bh-right-panel-button"
                  aria-label="Open right panel"
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
              <td v-if="hasSubtable" data-utility="subtable">
                <button
                  type="button"
                  class="bh-expand"
                  :aria-expanded="isExpanded(row, i)"
                  aria-label="Expand row"
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
                    <polyline
                      v-if="isExpanded(row, i)"
                      points="6 9 12 15 18 9"
                    />
                    <polyline v-else points="9 6 15 12 9 18" />
                  </svg>
                </button>
              </td>
              <template v-for="entry in bodyColumns" :key="entry.column.field">
                <td
                  v-if="hasCellSlot(entry.column)"
                  v-bind="cellAttrs(row, entry.column, i, entry.index)"
                >
                  <slot
                    v-if="rawSlots[`cell-${entry.column.field}`]"
                    :name="`cell-${entry.column.field}`"
                    v-bind="cellSlotProps(row, entry.column, i)"
                  />
                  <slot
                    v-else
                    name="cell"
                    v-bind="cellSlotProps(row, entry.column, i)"
                  />
                </td>
                <td
                  v-else-if="entry.column.html"
                  v-bind="
                    cellAttrs(
                      row,
                      entry.column,
                      i,
                      entry.index,
                      cellText(row, entry.column).title
                    )
                  "
                  v-html="cellText(row, entry.column).text"
                />
                <td
                  v-else
                  v-bind="
                    cellAttrs(
                      row,
                      entry.column,
                      i,
                      entry.index,
                      cellText(row, entry.column).title
                    )
                  "
                >
                  {{ cellText(row, entry.column).text }}
                </td>
              </template>
            </tr>
            <tr v-if="isExpanded(row, i)" class="bh-subtable-row">
              <td :colspan="columnCount">
                <slot name="subtable" :row="row" :row-index="i" />
              </td>
            </tr>
          </template>
          <tr
            v-if="rows.length === 0 && !loading && slots.empty"
            class="bh-empty-row"
          >
            <td :colspan="columnCount"><slot name="empty" /></td>
          </tr>
        </tbody>
        <tfoot v-if="footerRows.length > 0" class="bh-footer">
          <tr v-for="(footerRow, i) in footerRows" :key="i">
            <td v-if="utilityCount > 0" :colspan="utilityCount" />
            <td
              v-for="column in visibleColumns"
              :key="column.field"
              :data-field="column.field"
              :data-type="columnTypeOf(column)"
            >
              {{ footerText(footerRow, column) }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    <table-pagination v-if="showPagination" :pagination-props="paginationProps">
      <template #pagination="p">
        <slot name="pagination" v-bind="p" />
      </template>
    </table-pagination>
  </div>
</template>
