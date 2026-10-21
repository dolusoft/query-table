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
  LoadMoreSlotProps,
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
import { useChangeFlash } from './flash/use-change-flash'
import { useHeaderContextMenu } from './header/use-header-context-menu'
import TableBody from './parts/table-body.vue'
import TableFooter from './parts/table-footer.vue'
import TableHeader from './parts/table-header.vue'
import TablePagination from './parts/table-pagination.vue'
import { utilityKey, type Utility } from './pin/pin'
import { useHeaderGeometry } from './pin/use-header-geometry'
import { useColumnReorder } from './reorder/use-column-reorder'
import { measureColumnWidths } from './resize/measure-widths'
import { useAutoWidth } from './resize/use-auto-width'
import { useColumnResize } from './resize/use-column-resize'
import { useScrollBody } from './scroll/use-scroll-body'
import { useQueryTable } from './use-query-table'
import { useLoadMore } from './virtual/use-load-more'
import { useRowWindow } from './virtual/use-row-window'

defineOptions({ name: 'QueryTable' })

const props = withDefaults(defineProps<TableProps<T, Q>>(), {
  cursors: null,
  selection: undefined,
  rowPinning: undefined,
  searchDebounce: 300,
  rows: () => [],
  totalRows: null,
  footerRows: () => [],
  loading: false,
  sortable: false,
  filterable: false,
  resizable: false,
  autoWidth: false,
  autoWidthMax: undefined,
  reorderable: false,
  filterDebounce: 100,
  hasSubtable: false,
  rowExpandable: undefined,
  rowKind: undefined,
  groupBy: undefined,
  hasRightPanel: false,
  rowKey: undefined,
  labels: undefined,
  virtual: false,
  scrollBody: false,
  infinite: false,
  flash: false,
  rowsUpdate: undefined
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
  rowPinning: () => props.rowPinning,
  rowKey: () => props.rowKey,
  hasSubtable: () => props.hasSubtable,
  rowExpandable: () => props.rowExpandable,
  pageSizeOptions: () => props.pagination?.pageSizeOptions,
  onQueryChange: (query, reason) => emit('update:query', query, reason),
  onSelectionChange: selection => emit('update:selection', selection),
  onColumnsChange: (columns, reason) => emit('update:columns', columns, reason),
  onRowPinningChange: rowPinning => emit('update:rowPinning', rowPinning)
})
const { filters, sort, search, expansion } = state
const rowSelection = state.selection
const paginationProps = state.pagination

const labels = computed(() => resolveLabels(props.labels))

// C-28 / C-96: the browser menu is suppressed only for a consumer that listens.
// The check runs when the event fires: a listener is not a prop, so adding one
// later does not re-render the table.
const instance = getCurrentInstance()
// A `.once` listener arrives as `onCellContextMenuOnce` / `onHeaderContextMenuOnce`.
const hasContextMenuListener = () => {
  const vnodeProps = instance?.vnode.props
  return !!(vnodeProps?.onCellContextMenu || vnodeProps?.onCellContextMenuOnce)
}
const hasHeaderContextMenuListener = () => {
  const vnodeProps = instance?.vnode.props
  return !!(
    vnodeProps?.onHeaderContextMenu || vnodeProps?.onHeaderContextMenuOnce
  )
}

const entries = state.columns
const visibleColumns = computed(() => entries.value.map(e => e.column))

const { onContextMenu: onHeaderContextMenu } = useHeaderContextMenu({
  columns: () => visibleColumns.value,
  indexOf: field => entries.value.find(e => e.column.field === field)?.index,
  listening: () => hasHeaderContextMenuListener(),
  onContextMenu: payload => emit('headerContextMenu', payload)
})
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
/** The table of the header: with `scrollBody` the first of three (C-101). */
const tableEl = shallowRef<HTMLTableElement | null>(null)
// With `scrollBody` the body rows have a table of their own, and the three
// tables a wrapper each; without it the one table holds every part.
const bodyTableEl = shallowRef<HTMLTableElement | null>(null)
const headWrap = shallowRef<HTMLElement | null>(null)
const bodyWrap = shallowRef<HTMLElement | null>(null)
const footWrap = shallowRef<HTMLElement | null>(null)
/** The table of the body rows. */
const bodyTable = computed(() => bodyTableEl.value ?? tableEl.value)
/** With `scrollBody`, the body table to measure apart from the header. */
const splitBody = () => (props.scrollBody ? bodyTableEl.value : null)
const {
  widths,
  tableWidth,
  offsets,
  columns: cellWidths
} = useHeaderGeometry({
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
    props.scrollBody ||
    entries.value.some(entry => sideOf(entry.column) !== false) ||
    (props.resizable &&
      entries.value.some(entry => entry.column.resizable !== false))
})
/** The `col` widths of the body and footer tables (C-101), in pixels. */
const colWidths = computed(() =>
  Array.from({ length: columnCount.value }, (_, i) => cellWidths.value[i])
)
useScrollBody({
  enabled: () => props.scrollBody,
  wrappers: () => ({
    head: headWrap.value,
    body: bodyWrap.value,
    foot: footWrap.value
  }),
  headTable: () => tableEl.value,
  bodyTable: () => bodyTableEl.value,
  colWidths: () => colWidths.value,
  rows: () => props.rows
})
const resize = useColumnResize({
  resizable: () => props.resizable,
  measuredWidth: field => widths.value[field],
  tableWidth: () => tableWidth.value,
  body: splitBody,
  // C-68: the width goes back as `columnResize`, then as the new `columns`.
  emit: payload => {
    emit('columnResize', payload)
    const next = applyWidth(props.columns, payload.field, `${payload.width}px`)
    if (next) {
      emit('update:columns', next, 'resize')
    }
  }
})

// Automatic widths of the columns without a width (C-100): drawn on the
// header cells, never emitted.
const autoWidth = useAutoWidth({
  enabled: () => props.autoWidth,
  max: () => props.autoWidthMax,
  table: tableEl,
  body: splitBody,
  columns: () => visibleColumns.value,
  rows: () => props.rows,
  query: () => props.query,
  rowsUpdate: () => props.rowsUpdate
})

// The virtual body (C-83 to C-87) and infinite scroll (C-88 to C-90).
// Without `virtual` the body draws `bodyRows` as they are; without
// `infinite` nothing is asked for.
const rowWindow = useRowWindow<T>({
  virtual: () => props.virtual,
  table: bodyTable,
  bodyRows: () => state.rowPinning.rows.value,
  keyOf: expansion.keyOf,
  isExpanded: expansion.isExpanded,
  groupBy: () => props.groupBy
})
const infinite = useLoadMore({
  infinite: () => props.infinite,
  rowKey: () => props.rowKey,
  rows: () => props.rows,
  query: () => props.query,
  totalRows: () => props.totalRows,
  cursors: () => props.cursors,
  loading: () => props.loading,
  nextPage: () => paginationProps.value.nextPage(),
  table: bodyTable,
  virtual: rowWindow.enabled,
  window: () =>
    rowWindow.ready.value
      ? { end: rowWindow.range.value.end, count: rowWindow.centerCount() }
      : null
})
const loadMoreProps = computed<LoadMoreSlotProps | null>(() =>
  infinite.enabled.value
    ? {
        loadMore: infinite.loadMore,
        canLoadMore: infinite.canLoadMore.value,
        loading: props.loading
      }
    : null
)
const footerCount = computed(() => props.footerRows.length)
/** More to load in an infinite list: the count is not the rows given (C-86). */
const growing = () => infinite.enabled.value && infinite.canLoadMore.value
const ariaRowCount = computed(() => {
  if (!rowWindow.enabled()) {
    return undefined
  }
  const total = props.totalRows
  // The group rows of the pages still to load are unknown (C-104).
  if (growing() && (total === null || rowWindow.groupCount() > 0)) {
    return -1
  }
  const rows = growing() && total !== null ? total : props.rows.length
  return (
    1 +
    rows +
    rowWindow.expandedCount() +
    rowWindow.groupCount() +
    footerCount.value
  )
})
/** `aria-rowindex` of the first footer row, or `undefined` (C-86). */
const footerRowIndex = computed(() =>
  !rowWindow.enabled() || growing()
    ? undefined
    : 2 + props.rows.length + rowWindow.expandedCount() + rowWindow.groupCount()
)

// The change flash (C-93 to C-95). Off, one watcher of `flash` and nothing
// else; the body gets `null` and draws what it drew in 3.2.
const flashView = useChangeFlash<T>({
  flash: () => props.flash,
  rowsUpdate: () => props.rowsUpdate,
  rows: () => props.rows,
  query: () => props.query,
  loading: () => props.loading,
  fields: () => entries.value.map(entry => entry.column.field),
  rowKey: () => props.rowKey,
  table: bodyTable
})

const reorder = useColumnReorder({
  reorderable: () => props.reorderable,
  table: tableEl,
  layout: state.layout,
  columns: () => props.columns
})

provideTableContext({
  filters,
  sort,
  layout: state.layout,
  resize,
  reorder,
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
      name === 'loading' ||
      name === 'load-more' ||
      name === 'group'
  )
// A string, so the header sees a changed prop only when the set changes;
// one name per line, since a field name may hold a space.
const headerSlotNames = () =>
  Object.keys(rawSlots)
    .filter(
      name =>
        name.startsWith('header-') ||
        name === 'filter-datetime' ||
        name === 'filter-menu'
    )
    .sort()
    .join('\n')
// The `cell-<field>` slots the rows call, as one string: the body's cells
// change only when the set changes (K311-3).
const cellSlotNames = () =>
  Object.keys(rawSlots)
    .filter(name => name.startsWith('cell-'))
    .sort()
    .join('\n')

const exposed: QueryTableExpose = {
  collapseAll: expansion.collapseAll,
  expandAll: expansion.expandAll,
  focusFilter: field => focusFilterOf(tableEl.value, field),
  flushPendingFilters: () => {
    filters.flushAll()
  },
  scrollToIndex: rowWindow.scrollToIndex,
  loadMore: infinite.loadMore,
  measureColumnWidths: fields =>
    measureColumnWidths(tableEl.value, fields, splitBody())
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
    <div
      class="qt-table-responsive"
      :role="scrollBody ? 'table' : undefined"
      :aria-rowcount="scrollBody ? ariaRowCount : undefined"
    >
      <!-- C-101: three tables, so the body scrolls under the header; the
           body and footer columns take the widths of the header cells. -->
      <template v-if="scrollBody">
        <div ref="headWrap" class="qt-table-head">
          <table ref="tableEl" class="qt-table" role="presentation">
            <thead role="rowgroup" @contextmenu="onHeaderContextMenu">
              <table-header
                :columns="visibleColumns"
                :query="query"
                :filterable="filterable"
                :utilities="utilities"
                :has-pinned="hasPinned"
                :offsets="offsets"
                :auto-widths="autoWidth.widths.value"
                :slot-names="headerSlotNames()"
                :aria-rowindex="rowWindow.enabled() ? 1 : undefined"
                roles
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
          </table>
        </div>
        <div ref="bodyWrap" class="qt-table-body">
          <table ref="bodyTableEl" class="qt-table" role="presentation">
            <colgroup>
              <col
                v-for="(width, i) in colWidths"
                :key="i"
                :style="
                  width === undefined ? undefined : { width: `${width}px` }
                "
              />
            </colgroup>
            <table-body
              :rows="rows"
              :body-rows="rowWindow.drawn.value"
              :pin-row="state.rowPinning.pin"
              :loading="loading"
              :entries="entries"
              :slot-names="cellSlotNames()"
              :column-count="columnCount"
              :has-subtable="hasSubtable"
              :has-right-panel="hasRightPanel"
              :has-selection="rowSelection.enabled.value"
              :is-selected="rowSelection.isSelected"
              :toggle-selected="rowSelection.toggle"
              :has-pinned="hasPinned"
              :offsets="offsets"
              :key-of="expansion.keyOf"
              :can-expand="expansion.canExpand"
              :is-expanded="expansion.isExpanded"
              :toggle="expansion.toggle"
              :row-kind="rowKind"
              :labels="labels"
              :has-context-menu-listener="hasContextMenuListener"
              :load-more="loadMoreProps"
              :flash="flashView"
              roles
              @row-right-panel-click="row => emit('rowRightPanelClick', row)"
              @cell-context-menu="payload => emit('cellContextMenu', payload)"
              @focusin="rowWindow.onFocusIn"
              @focusout="rowWindow.onFocusOut"
            >
              <template v-for="name in bodySlotNames()" :key="name" #[name]="p">
                <!-- Names are dynamic (cell-<field>); the types only widen here. -->
                <slot :name="name as 'cell-x'" v-bind="p as CellSlotProps<T>" />
              </template>
            </table-body>
          </table>
        </div>
        <div v-if="footerRows.length > 0" ref="footWrap" class="qt-table-foot">
          <table class="qt-table" role="presentation">
            <colgroup>
              <col
                v-for="(width, i) in colWidths"
                :key="i"
                :style="
                  width === undefined ? undefined : { width: `${width}px` }
                "
              />
            </colgroup>
            <table-footer
              :footer-rows="footerRows"
              :entries="entries"
              :utility-count="utilityCount"
              :has-pinned="hasPinned"
              :offsets="offsets"
              :first-row-index="footerRowIndex"
              roles
            />
          </table>
        </div>
      </template>
      <table
        v-else
        ref="tableEl"
        class="qt-table"
        :aria-rowcount="ariaRowCount"
      >
        <thead @contextmenu="onHeaderContextMenu">
          <table-header
            :columns="visibleColumns"
            :query="query"
            :filterable="filterable"
            :utilities="utilities"
            :has-pinned="hasPinned"
            :offsets="offsets"
            :auto-widths="autoWidth.widths.value"
            :slot-names="headerSlotNames()"
            :aria-rowindex="rowWindow.enabled() ? 1 : undefined"
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
          :body-rows="rowWindow.drawn.value"
          :pin-row="state.rowPinning.pin"
          :loading="loading"
          :entries="entries"
          :slot-names="cellSlotNames()"
          :column-count="columnCount"
          :has-subtable="hasSubtable"
          :has-right-panel="hasRightPanel"
          :has-selection="rowSelection.enabled.value"
          :is-selected="rowSelection.isSelected"
          :toggle-selected="rowSelection.toggle"
          :has-pinned="hasPinned"
          :offsets="offsets"
          :key-of="expansion.keyOf"
          :can-expand="expansion.canExpand"
          :is-expanded="expansion.isExpanded"
          :toggle="expansion.toggle"
          :row-kind="rowKind"
          :labels="labels"
          :has-context-menu-listener="hasContextMenuListener"
          :load-more="loadMoreProps"
          :flash="flashView"
          @row-right-panel-click="row => emit('rowRightPanelClick', row)"
          @cell-context-menu="payload => emit('cellContextMenu', payload)"
          @focusin="rowWindow.onFocusIn"
          @focusout="rowWindow.onFocusOut"
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
          :first-row-index="footerRowIndex"
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
