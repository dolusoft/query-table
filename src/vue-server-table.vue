<script setup lang="ts" generic="T extends object">
import { useSlots } from 'vue'

import TableBody from './body/table-body.vue'
import TableFooter from './body/table-footer.vue'
import { useExpansion } from './body/use-expansion'
import ColumnHeader from './components/column-header.vue'
import type {
  CellSlotProps,
  TableEmits,
  TableProps,
  TableSlots,
  VueServerTableExpose
} from './contract'
import { useColumns } from './core/use-columns'
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

const { entries, visibleColumns, utilityCount, columnCount } = useColumns({
  columns: () => props.columns,
  hasSubtable: () => props.hasSubtable,
  hasRightPanel: () => props.hasRightPanel
})

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

const { keyOf, isExpanded, toggle, collapseAll } = useExpansion({
  rows: () => props.rows,
  rowKey: () => props.rowKey,
  enabled: () => props.hasSubtable
})

// The slots `table-body` draws: only the ones the consumer gave are passed on,
// so the body can tell whether a `cell`, `loader` or `empty` slot exists.
const bodySlotNames = () =>
  Object.keys(rawSlots).filter(
    name =>
      name === 'cell' ||
      name.startsWith('cell-') ||
      name === 'subtable' ||
      name === 'loader' ||
      name === 'empty'
  )

const exposed: VueServerTableExpose = {
  collapseAll,
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
        <table-body
          :rows="rows"
          :entries="entries"
          :column-count="columnCount"
          :loading="loading"
          :has-subtable="hasSubtable"
          :has-right-panel="hasRightPanel"
          :truncate="truncate"
          :truncate-max-length="truncateMaxLength"
          :key-of="keyOf"
          :is-expanded="isExpanded"
          :toggle="toggle"
          @row-right-panel-click="row => emit('rowRightPanelClick', row)"
          @cell-context-menu="payload => emit('cellContextMenu', payload)"
        >
          <template v-for="name in bodySlotNames()" :key="name" #[name]="p">
            <!-- Names are dynamic (cell-<field>); the types only widen here. -->
            <slot :name="name as 'cell'" v-bind="p as CellSlotProps<T>" />
          </template>
        </table-body>
        <table-footer
          v-if="footerRows.length > 0"
          :footer-rows="footerRows"
          :entries="entries"
          :utility-count="utilityCount"
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
