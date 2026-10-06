<script
  setup
  lang="ts"
  generic="T extends object, Q extends Query = TableQuery"
>
import { computed, getCurrentInstance, shallowRef, useSlots } from 'vue'

import { applyWidth, sideOf, type PinSide } from './columns/column-layout'
import type {
  CellSlotProps,
  HeaderSlotProps,
  Query,
  QueryTableExpose,
  TableEmits,
  TableProps,
  TableQuery,
  TableSlots,
  ToolbarSlotProps
} from './contract'
import { resolveLabels } from './core/labels'
import { provideTableContext } from './core/table-context'
import { focusFilterOf } from './filter/focus-filter'
import TableBody from './parts/table-body.vue'
import TableFooter from './parts/table-footer.vue'
import TableHeader from './parts/table-header.vue'
import TablePagination from './parts/table-pagination.vue'
import { utilityKey, type Utility } from './pin/pin'
import { useHeaderGeometry } from './pin/use-header-geometry'
import { useColumnResize } from './resize/use-column-resize'
import { useQueryTable } from './use-query-table'

defineOptions({ name: 'QueryTable' })

const props = withDefaults(defineProps<TableProps<T, Q>>(), {
  cursors: null,
  selection: undefined,
  searchDebounce: 300,
  rows: () => [],
  totalRows: null,
  footerRows: () => [],
  loading: false,
  sortable: false,
  filterable: false,
  resizable: false,
  filterDebounce: 100,
  hasSubtable: false,
  hasRightPanel: false,
  rowKey: undefined,
  labels: undefined
})

const emit = defineEmits<TableEmits<T, Q>>()

const slots = defineSlots<TableSlots<T>>()
const rawSlots = useSlots()

// Every piece of state lives in the composable; the component draws it. The
// table never writes to its props.
const state = useQueryTable<T, Q>({
  query: () => props.query,
  columns: () => props.columns,
  rows: () => props.rows,
  totalRows: () => props.totalRows,
  cursors: () => props.cursors,
  sortable: () => props.sortable,
  filterDebounce: () => props.filterDebounce,
  searchDebounce: () => props.searchDebounce,
  selection: () => props.selection,
  rowKey: () => props.rowKey,
  hasSubtable: () => props.hasSubtable,
  pageSizeOptions: () => props.pagination?.pageSizeOptions,
  onQueryChange: (query, reason) => emit('update:query', query, reason),
  onSelectionChange: selection => emit('update:selection', selection),
  onColumnsChange: (columns, reason) => emit('update:columns', columns, reason)
})
const { filters, sort, search, expansion } = state
const rowSelection = state.selection
const paginationProps = state.pagination

const labels = computed(() => resolveLabels(props.labels))

// C-28: the browser menu is suppressed only for a consumer that listens. The
// check runs when the event fires: a listener is not a prop, so adding one
// later does not re-render the table.
const instance = getCurrentInstance()
// A `.once` listener arrives as `onCellContextMenuOnce`.
const hasContextMenuListener = () => {
  const vnodeProps = instance?.vnode.props
  return !!(vnodeProps?.onCellContextMenu || vnodeProps?.onCellContextMenuOnce)
}

const entries = state.columns
const visibleColumns = computed(() => entries.value.map(e => e.column))
const hasPinned = state.hasPinned
/** Right panel first, then subtable, then selection (C-22: the first hosts clear-all). */
const utilities = computed(() =>
  [
    props.hasRightPanel ? 'right-panel' : null,
    props.hasSubtable ? 'subtable' : null,
    rowSelection.enabled.value ? 'select' : null
  ].filter((name): name is Utility => name !== null)
)
const utilityCount = computed(() => utilities.value.length)
const columnCount = computed(() => entries.value.length + utilityCount.value)

/** Utilities are pinned only with a left-pinned column (C-46, C-71). */
const utilitySide = (): PinSide => (hasPinned.value ? 'left' : false)
const tableEl = shallowRef<HTMLTableElement | null>(null)
const { widths, tableWidth, offsets } = useHeaderGeometry({
  table: tableEl,
  cells: () => [
    ...utilities.value.map(utility => ({
      key: utilityKey(utility),
      side: utilitySide()
    })),
    ...entries.value.map(({ column }) => ({
      key: column.field,
      side: sideOf(column)
    }))
  ],
  active: () =>
    entries.value.some(entry => sideOf(entry.column) !== false) ||
    (props.resizable &&
      entries.value.some(entry => entry.column.resizable !== false))
})
const resize = useColumnResize({
  resizable: () => props.resizable,
  measuredWidth: field => widths.value[field],
  tableWidth: () => tableWidth.value,
  // C-68: the width goes back as `columnResize`, then as the new `columns`.
  emit: payload => {
    emit('columnResize', payload)
    const next = applyWidth(props.columns, payload.field, `${payload.width}px`)
    if (next) {
      emit('update:columns', next, 'resize')
    }
  }
})

provideTableContext({
  filters,
  sort,
  layout: state.layout,
  resize,
  selection: rowSelection,
  labels: () => labels.value
})

const showPagination = computed(
  () =>
    !!slots.pagination &&
    (props.rows.length > 0 ||
      (props.totalRows ?? 0) > 0 ||
      (props.pagination?.alwaysShow ?? false))
)

// A computed, so a pending filter draft re-renders the root only when the
// answer changes, not with every key typed.
const canClearFilters = computed(() => filters.canClearAll())

const toolbarProps = (): ToolbarSlotProps => ({
  canClearFilters: canClearFilters.value,
  clearFilters: () => {
    filters.clearAll()
  },
  search: search.text.value,
  setSearch: search.set,
  applySearch: () => {
    search.apply()
  }
})

// The slots `table-body` draws: only the ones the consumer gave are passed on,
// so the body can tell whether a `cell-<field>` or `empty` slot exists.
const bodySlotNames = () =>
  Object.keys(rawSlots).filter(
    name =>
      name.startsWith('cell-') ||
      name === 'subtable' ||
      name === 'empty' ||
      name === 'loading'
  )
// A string, so the header sees a changed prop only when the set changes.
const headerSlotNames = () =>
  Object.keys(rawSlots)
    .filter(
      name =>
        name.startsWith('header-') ||
        name === 'filter-datetime' ||
        name === 'filter-menu'
    )
    .sort()
    .join(' ')

const exposed: QueryTableExpose = {
  collapseAll: expansion.collapseAll,
  expandAll: expansion.expandAll,
  focusFilter: field => focusFilterOf(tableEl.value, field),
  flushPendingFilters: () => {
    filters.flushAll()
  }
}
defineExpose(exposed)
</script>

<template>
  <div
    class="qt-datatable"
    :data-empty="!loading && rows.length === 0 ? '' : undefined"
    :data-loading="loading ? '' : undefined"
    :aria-busy="loading ? 'true' : undefined"
  >
    <slot name="toolbar" v-bind="toolbarProps()" />
    <div class="qt-table-responsive">
      <table ref="tableEl" class="qt-table">
        <thead>
          <table-header
            :columns="visibleColumns"
            :query="query"
            :filterable="filterable"
            :utilities="utilities"
            :has-pinned="hasPinned"
            :offsets="offsets"
            :slot-names="headerSlotNames()"
          >
            <!-- Stable slots: the header re-renders only when its props
                 change, not with every render of the root (`loading`,
                 `rows`). `slot-names` says which ones the consumer gave. -->
            <template #header="p">
              <!-- Names are dynamic (header-<field>); the types only widen here. -->
              <slot
                :name="`header-${p.column.field}` as 'header-x'"
                v-bind="p as HeaderSlotProps"
              />
            </template>
            <template #filter-datetime="p">
              <slot name="filter-datetime" v-bind="p" />
            </template>
            <template #filter-menu="p">
              <slot name="filter-menu" v-bind="p" />
            </template>
          </table-header>
        </thead>
        <table-body
          :rows="rows"
          :loading="loading"
          :entries="entries"
          :column-count="columnCount"
          :has-subtable="hasSubtable"
          :has-right-panel="hasRightPanel"
          :has-selection="rowSelection.enabled.value"
          :is-selected="rowSelection.isSelected"
          :toggle-selected="rowSelection.toggle"
          :has-pinned="hasPinned"
          :offsets="offsets"
          :key-of="expansion.keyOf"
          :is-expanded="expansion.isExpanded"
          :toggle="expansion.toggle"
          :labels="labels"
          :has-context-menu-listener="hasContextMenuListener"
          @row-right-panel-click="row => emit('rowRightPanelClick', row)"
          @cell-context-menu="payload => emit('cellContextMenu', payload)"
        >
          <template v-for="name in bodySlotNames()" :key="name" #[name]="p">
            <!-- Names are dynamic (cell-<field>); the types only widen here. -->
            <slot :name="name as 'cell-x'" v-bind="p as CellSlotProps<T>" />
          </template>
        </table-body>
        <table-footer
          v-if="footerRows.length > 0"
          :footer-rows="footerRows"
          :entries="entries"
          :utility-count="utilityCount"
          :has-pinned="hasPinned"
          :offsets="offsets"
        />
      </table>
    </div>
    <table-pagination v-if="showPagination" :pagination-props="paginationProps">
      <template #pagination="p">
        <slot name="pagination" v-bind="p" />
      </template>
    </table-pagination>
  </div>
</template>
