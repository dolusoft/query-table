<script setup lang="ts" generic="T extends object">
import { useSlots } from 'vue'

import TableBody from './body/table-body.vue'
import TableFooter from './body/table-footer.vue'
import { useExpansion } from './body/use-expansion'
import type {
  CellSlotProps,
  TableEmits,
  TableProps,
  TableSlots,
  QueryTableExpose
} from './contract'
import { provideTableContext } from './core/table-context'
import { useColumns } from './core/use-columns'
import { useQueryEmitter } from './core/use-query-emitter'
import { useFilterDrafts } from './filter/use-filter-drafts'
import TableHeader from './header/table-header.vue'
import TablePagination from './pagination/table-pagination.vue'
import { usePagination } from './pagination/use-pagination'
import { useSort } from './sort/use-sort'

defineOptions({ name: 'QueryTable' })

const props = withDefaults(defineProps<TableProps<T>>(), {
  rows: () => [],
  totalRows: null,
  footerRows: () => [],
  sortable: false,
  filterable: false,
  filterDebounce: 100,
  hasSubtable: false,
  hasRightPanel: false,
  rowKey: undefined
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

provideTableContext({ drafts, sort })

const { entries, visibleColumns, utilityCount, columnCount } = useColumns({
  columns: () => props.columns,
  hasSubtable: () => props.hasSubtable,
  hasRightPanel: () => props.hasRightPanel
})

const { keyOf, isExpanded, toggle, collapseAll } = useExpansion({
  rows: () => props.rows,
  rowKey: () => props.rowKey,
  enabled: () => props.hasSubtable
})

// The slots `table-body` draws: only the ones the consumer gave are passed on,
// so the body can tell whether a `cell-<field>` or `empty` slot exists.
const bodySlotNames = () =>
  Object.keys(rawSlots).filter(
    name => name.startsWith('cell-') || name === 'subtable' || name === 'empty'
  )

const exposed: QueryTableExpose = {
  collapseAll,
  flushPendingFilters: () => {
    drafts.flushAll()
  }
}
defineExpose(exposed)
</script>

<template>
  <div class="qt-datatable" :data-empty="rows.length === 0 ? '' : undefined">
    <slot name="toolbar" />
    <div class="qt-table-responsive">
      <table class="qt-table">
        <thead>
          <table-header
            :columns="visibleColumns"
            :query="query"
            :filterable="filterable"
            :has-subtable="hasSubtable"
            :has-right-panel="hasRightPanel"
          >
            <template v-if="rawSlots['filter-datetime']" #filter-datetime="p">
              <slot name="filter-datetime" v-bind="p" />
            </template>
            <template v-if="rawSlots['filter-menu']" #filter-menu="p">
              <slot name="filter-menu" v-bind="p" />
            </template>
          </table-header>
        </thead>
        <table-body
          :rows="rows"
          :entries="entries"
          :column-count="columnCount"
          :has-subtable="hasSubtable"
          :has-right-panel="hasRightPanel"
          :key-of="keyOf"
          :is-expanded="isExpanded"
          :toggle="toggle"
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
