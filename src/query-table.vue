<script setup lang="ts" generic="T extends object">
import { computed, getCurrentInstance, shallowRef, useSlots } from 'vue'

import TableBody from './body/table-body.vue'
import TableFooter from './body/table-footer.vue'
import { useExpansion } from './body/use-expansion'
import type {
  CellSlotProps,
  HeaderSlotProps,
  TableEmits,
  TableProps,
  TableSlots,
  QueryTableExpose
} from './contract'
import { resolveLabels } from './core/labels'
import { provideTableContext } from './core/table-context'
import { useColumns } from './core/use-columns'
import { useQueryEmitter } from './core/use-query-emitter'
import { focusFilterOf } from './filter/focus-filter'
import { useFilterDrafts } from './filter/use-filter-drafts'
import TableHeader from './header/table-header.vue'
import TablePagination from './pagination/table-pagination.vue'
import { usePagination } from './pagination/use-pagination'
import { utilityKey } from './pin/pin'
import { useHeaderGeometry } from './pin/use-header-geometry'
import { useColumnResize } from './resize/use-column-resize'
import { useSort } from './sort/use-sort'

defineOptions({ name: 'QueryTable' })

const props = withDefaults(defineProps<TableProps<T>>(), {
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

const emit = defineEmits<TableEmits<T>>()

const slots = defineSlots<TableSlots<T>>()
const rawSlots = useSlots()

// The table never writes to its props (see use-query-emitter.ts).
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

const { paginationProps, showPagination } = usePagination({
  props,
  base,
  update,
  flushFilters: () => drafts.flushAll(),
  hasSlot: () => !!slots.pagination
})

const sort = useSort({
  sortable: () => props.sortable,
  query: () => props.query,
  base,
  update,
  flushFilters: () => {
    drafts.flushAll()
  }
})

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

const {
  entries,
  visibleColumns,
  utilities,
  utilityCount,
  columnCount,
  hasPinned
} = useColumns({
  columns: () => props.columns,
  hasSubtable: () => props.hasSubtable,
  hasRightPanel: () => props.hasRightPanel
})

const tableEl = shallowRef<HTMLTableElement | null>(null)
const { widths, tableWidth, offsets } = useHeaderGeometry({
  table: tableEl,
  cells: () => [
    ...utilities.value.map(utility => ({
      key: utilityKey(utility),
      pinned: hasPinned.value
    })),
    ...entries.value.map(({ column }) => ({
      key: column.field,
      pinned: column.pinned === 'left'
    }))
  ],
  active: () =>
    hasPinned.value ||
    (props.resizable &&
      entries.value.some(entry => entry.column.resizable !== false))
})
const resize = useColumnResize({
  resizable: () => props.resizable,
  measuredWidth: field => widths.value[field],
  tableWidth: () => tableWidth.value,
  emit: payload => emit('columnResize', payload)
})

provideTableContext({
  drafts,
  sort,
  resize,
  labels: () => labels.value
})

const { keyOf, isExpanded, toggle, collapseAll, expandAll } = useExpansion({
  rows: () => props.rows,
  rowKey: () => props.rowKey,
  enabled: () => props.hasSubtable
})

const toolbarProps = () => ({
  canClearFilters: drafts.canClearAll(),
  clearFilters: () => {
    drafts.clearAll()
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
  collapseAll,
  expandAll,
  focusFilter: field => focusFilterOf(tableEl.value, field),
  flushPendingFilters: () => {
    drafts.flushAll()
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
          :has-pinned="hasPinned"
          :offsets="offsets"
          :key-of="keyOf"
          :is-expanded="isExpanded"
          :toggle="toggle"
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
