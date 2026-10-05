<script setup lang="ts">
import { computed, ref, useSlots, watch } from 'vue'

import ButtonExpand from './button-expand.vue'
import ButtonRightPanel from './button-rightpanel.vue'
import columnHeader from './column-header.vue'
import TruncatedCell from './truncated-cell.vue'
import type { ColumnDefinition } from '../model/column-model'

defineOptions({ name: 'VueServerTable' })

const slots = useSlots()

// Check if filter-datetime slot is provided
const hasFilterDatetimeSlot = computed(() => !!slots['filter-datetime'])

export interface Props {
  loading?: boolean
  skin?: string
  totalRows?: number
  rows?: Array<any>
  footerRows?: Array<any>
  columns?: Array<ColumnDefinition>
  hasSubtable?: boolean
  hasRightPanel?: boolean
  rightPanelColumnWidth?: string
  subtableColumnWidth?: string
  subtableMaxHeight?: string
  search?: string
  page?: number // default: 1
  pageSize?: number // default: 10
  pageSizeOptions?: Array<number> // default: [10, 20, 30, 50, 100]
  showPageSize?: boolean
  sortable?: boolean
  sortColumn?: string
  sortDirection?: string
  columnFilter?: boolean
  filterDebounce?: number // Debounce time for filter inputs in ms (default: 100)
  pagination?: boolean
  stickyHeader?: boolean
  stickyFooter?: boolean
  height?: string // default 500px - only working with sticky headers
  enableloadinganimation?: boolean
  enablefooterpagination?: boolean
  alwaysShowPagination?: boolean
  footerOffset?: number
  tableRightOffset?: number
  tableLeftOffset?: number
  // Truncate options
  truncate?: boolean // Enable text truncation globally (default: true)
  defaultMaxWidth?: string // Default max-width for cells (default: '400px')
  truncateMaxLength?: number // Max character length before truncating (default: 150)
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  skin: 'bh-table-striped bh-table-hover',
  totalRows: 0,
  rows: () => [],
  footerRows: () => [],
  columns: () => [],
  hasSubtable: false,
  hasRightPanel: false,
  rightPanelColumnWidth: '40px',
  subtableColumnWidth: '40px',
  subtableMaxHeight: '400px',
  search: '',
  page: 1,
  pageSize: 10,
  pageSizeOptions: () => [10, 20, 30, 50, 100],
  showPageSize: true,
  sortable: false,
  sortColumn: 'id',
  sortDirection: 'asc',
  columnFilter: false,
  filterDebounce: 100,
  pagination: true,
  stickyHeader: false,
  stickyFooter: false,
  height: '500px',
  enableloadinganimation: false,
  enablefooterpagination: false,
  alwaysShowPagination: false,
  footerOffset: 0,
  tableRightOffset: 0,
  tableLeftOffset: 5,
  truncate: true,
  defaultMaxWidth: '400px',
  truncateMaxLength: 150
})

const emit = defineEmits(['change', 'rowRightPanelClick', 'cellContextMenu'])

// Default filter condition for a column type: text columns match by Contains,
// every other type matches exactly. Both 'string' and 'String' count as text.
const defaultConditionFor = (type?: string) =>
  type === 'string' || type === 'String' ? 'Contains' : 'Equal'

// set default columns values
for (const item of props.columns || []) {
  const type = item.type?.toLowerCase() || 'string'
  item.type = type
  item.hide = item.hide !== undefined ? item.hide : false
  item.dataOnly = item.dataOnly !== undefined ? item.dataOnly : false
  item.filter = item.filter !== undefined ? item.filter : true
  item.sort = item.sort !== undefined ? item.sort : true
  item.html = item.html !== undefined ? item.html : false
  item.maxWidth = item.maxWidth || props.defaultMaxWidth
  // Only set condition if value exists, otherwise leave empty
  if (item.value !== undefined && item.value !== null && item.value !== '') {
    item.condition = item.condition || defaultConditionFor(type)
  } else {
    item.condition = ''
  }
}

const currentPage = ref(props.page)
const currentPageSize = ref(
  props.pagination ? props.pageSize : props.rows?.length
)
const currentSortColumn = ref(props.sortColumn)
const currentSortDirection = ref(props.sortDirection)
const currentSearch = ref(props.search)

// The consumer pages on the server: the row count comes from it, rows are
// drawn exactly as given.
const filterRowCount = computed(() => props.totalRows || 0)

const isOpenFilter = ref<string | null>(null)

// Trigger for external filter updates (used by setColumnFilter)
const filterUpdateTrigger = ref(0)

// Ref for column-header component to access flush methods
const columnHeaderRef = ref<InstanceType<typeof columnHeader> | null>(null)

const cellValue = (item: any, field: string | undefined) =>
  field ? field.split('.').reduce((obj, key) => obj?.[key], item) : undefined

const expandedrows = ref<Map<any, boolean>>(new Map())

const expandedRowId = (item: any, index: number) =>
  item._rowIndex !== undefined ? item._rowIndex : item.id || index

const isRowExpanded = (item: any, index: number) =>
  expandedrows.value.get(expandedRowId(item, index)) === true

// Rows may arrive with `isExpanded` set (print mode opens them this way).
watch(
  () => props.rows,
  rows => {
    if (!props.hasSubtable) {
      return
    }
    rows.forEach((row, index) => {
      if (row.isExpanded !== undefined) {
        expandedrows.value.set(expandedRowId(row, index), row.isExpanded)
      }
    })
  },
  { immediate: true }
)

// Cell context menu handler
const handleCellContextMenu = (
  event: MouseEvent,
  row: any,
  column: ColumnDefinition,
  value: any,
  rowIndex: number,
  columnIndex: number
) => {
  event.preventDefault()
  emit('cellContextMenu', {
    event,
    row,
    column,
    value,
    rowIndex,
    columnIndex
  })
}

// Maximum number of pages
const maxPage = computed(() => {
  const totalPages =
    (currentPageSize.value as number) < 1
      ? 1
      : Math.ceil(filterRowCount.value / (currentPageSize.value as number))
  return Math.max(totalPages || 0, 1)
})

const toggleFilterMenu = (col: ColumnDefinition | null) => {
  if (col && isOpenFilter.value !== col.field) {
    isOpenFilter.value = col.field ?? null
  } else {
    isOpenFilter.value = null
  }
}

const previousPage = () => {
  if (currentPage.value === 1) {
    return false
  }
  currentPage.value--
}

const nextPage = () => {
  if (currentPage.value >= maxPage.value) {
    return false
  }
  currentPage.value++
}

const setPageSize = (pagesize: number) => {
  currentPageSize.value = pagesize
}

const setDefaultCondition = () => {
  for (const d of props.columns) {
    if (
      d.filter &&
      ((d.value !== undefined && d.value !== null && d.value !== '') ||
        d.condition === 'IsNull' ||
        d.condition === 'IsNotNull')
    ) {
      if (
        (d.type === 'string' || d.type === 'String') &&
        d.value &&
        !d.condition
      ) {
        d.condition = 'Contains'
      }
      if (d.type === 'number' && d.value && !d.condition) {
        d.condition = 'Equal'
      }
      if (d.type === 'date' && d.value && !d.condition) {
        d.condition = 'Equal'
      }
    }
  }
}

const emitChange = (changeType: string, isResetPage = false) => {
  setDefaultCondition()
  emit('change', {
    current_page: isResetPage ? 1 : currentPage.value,
    pagesize: currentPageSize.value,
    offset: (currentPage.value - 1) * (currentPageSize.value as number),
    sort_column: currentSortColumn.value,
    sort_direction: currentSortDirection.value,
    search: currentSearch.value,
    column_filters: props.columns,
    change_type: changeType
  })
}

// A change that has to start from the first page: on page 1 it is reported
// as itself, otherwise moving to page 1 reports it as a page change.
const emitFromFirstPage = (changeType: string) => {
  if (currentPage.value === 1) {
    emitChange(changeType, true)
  } else {
    currentPage.value = 1
  }
}

watch(currentPage, () => emitChange('page'))
watch(currentPageSize, () => emitFromFirstPage('pagesize'))

watch(
  () => props.search,
  () => {
    currentSearch.value = props.search
    emitFromFirstPage('search')
  }
)

const sortChange = (field: string, specifiedDirection?: string) => {
  // Empty field = clear sort completely
  if (!field) {
    currentSortColumn.value = ''
    currentSortDirection.value = ''
    emitChange('sort')
    return
  }

  // Use specified direction or auto-toggle (header click)
  let direction = specifiedDirection || 'asc'
  if (
    !specifiedDirection &&
    field === currentSortColumn.value &&
    currentSortDirection.value === 'asc'
  ) {
    direction = 'desc'
  }

  currentSortColumn.value = field
  currentSortDirection.value = direction
  emitChange('sort')
}

const filterChange = () => emitFromFirstPage('filter')

const clearAllFilters = () => {
  for (const col of props.columns) {
    if (col.filter) {
      col.value = ''
      col.condition = ''
      col.parsedFilterRules = undefined
    }
  }

  // Clear sort completely
  currentSortColumn.value = ''
  currentSortDirection.value = ''

  emitChange('filter', true)
}

const collapseAll = () => {
  expandedrows.value.forEach((value, key) => {
    expandedrows.value.set(key, false)
  })
}

defineExpose({
  getColumnFilters() {
    return props.columns
  },
  collapseAll,
  clearAllFilters,
  /**
   * Set column filter value and optionally trigger filter
   * @param field - Column field name
   * @param value - Filter value
   * @param condition - Filter condition (default: Contains for text columns, Equal otherwise)
   * @param triggerFilter - Whether to emit a filter change (default: false)
   */
  setColumnFilter(
    field: string,
    value: string,
    condition?: string,
    triggerFilter: boolean = false
  ) {
    const column = props.columns.find(col => col.field === field)
    if (column) {
      column.value = value
      // Set condition: use provided or fall back to the type default
      column.condition = condition || defaultConditionFor(column.type)
      // Clear any parser-generated rules (manual set overrides operator shortcuts)
      column.parsedFilterRules = undefined
      // Trigger UI update in column-header
      filterUpdateTrigger.value++
      if (triggerFilter) {
        filterChange()
      }
    }
    return !!column
  },
  /**
   * Flush all pending filter debounces
   * Call this before getColumnFilters() when Enter is pressed
   * to ensure all filter values are immediately processed
   */
  flushAllFilterDebounces() {
    columnHeaderRef.value?.flushAllFilterDebounces?.()
  }
})

const extracolumnlength = computed(
  () => Number(props.hasSubtable) + Number(props.hasRightPanel)
)
</script>
<template>
  <div
    class="bh-datatable bh-antialiased bh-relative bh-text-black bh-text-sm bh-font-normal"
  >
    <div
      class="bh-w-full bh-h-full"
      :style="{
        height: props.height,
        'padding-right': tableRightOffset + 'px',
        'padding-left': tableLeftOffset + 'px'
      }"
    >
      <slot name="tableactionheader"></slot>
      <div
        class="bh-table-responsive"
        :class="{ 'bh-min-h-[100px]': props.loading }"
        :style="{
          overflow: 'auto',
          height: props.stickyHeader
            ? Number(props.height.replace('px', '')) - props.footerOffset + 'px'
            : 'auto'
        }"
      >
        <table :class="[props.skin]">
          <thead
            :class="{
              'bh-sticky bh-top-0 bh-z-10': props.stickyHeader
            }"
          >
            <column-header
              ref="columnHeaderRef"
              :all="props"
              :currentSortColumn="currentSortColumn"
              :currentSortDirection="currentSortDirection"
              :isOpenFilter="isOpenFilter"
              :hasFilterDatetimeSlot="hasFilterDatetimeSlot"
              :filterUpdateTrigger="filterUpdateTrigger"
              @sortChange="sortChange"
              @filterChange="filterChange"
              @toggleFilterMenu="toggleFilterMenu"
              @clearAllFilters="clearAllFilters"
            >
              <template
                v-if="hasFilterDatetimeSlot"
                #filter-datetime="slotProps"
              >
                <slot name="filter-datetime" v-bind="slotProps" />
              </template>
            </column-header>
          </thead>
          <tbody>
            <template v-for="(item, i) in props.rows" :key="i">
              <tr v-if="filterRowCount" @click.prevent>
                <td
                  v-if="props.hasRightPanel"
                  :style="{
                    width: props.rightPanelColumnWidth + ' !important',
                    minWidth: props.rightPanelColumnWidth + ' !important',
                    padding: '0px !important'
                  }"
                >
                  <ButtonRightPanel
                    :item="item"
                    @rightPanelClick="
                      rowData => emit('rowRightPanelClick', rowData)
                    "
                  >
                  </ButtonRightPanel>
                </td>
                <td
                  v-if="props.hasSubtable"
                  :style="{
                    width: props.subtableColumnWidth + ' !important',
                    minWidth: props.subtableColumnWidth + ' !important'
                  }"
                >
                  <button-expand
                    :item="{ ...item, _rowIndex: i }"
                    :expandedrows="expandedrows"
                  >
                  </button-expand>
                </td>
                <template v-for="(col, j) in props.columns">
                  <td
                    v-if="!col.hide && !col.dataOnly"
                    :key="col.field"
                    :class="[col.cellClass ? col.cellClass : '']"
                    :style="{
                      maxWidth: props.truncate ? col.maxWidth : undefined
                    }"
                    @contextmenu="
                      handleCellContextMenu(
                        $event,
                        item,
                        col,
                        cellValue(item, col.field),
                        i,
                        j
                      )
                    "
                  >
                    <!-- Slots bypass truncation - user controls rendering -->
                    <template v-if="col.field && slots[col.field]">
                      <slot :name="col.field" :value="item"></slot>
                    </template>
                    <truncated-cell
                      v-else
                      :value="cellValue(item, col.field)"
                      :truncate="props.truncate"
                      :max-length="props.truncateMaxLength"
                      :html="col.html"
                    />
                  </td>
                </template>
              </tr>
              <template v-if="isRowExpanded(item, i) && props.hasSubtable">
                <tr @click.prevent>
                  <td :colspan="props.columns.length + extracolumnlength">
                    <div
                      class="subtable-container"
                      :style="{
                        maxHeight: props.subtableMaxHeight,
                        overflow: 'auto',
                        padding: '10px',
                        background: 'var(--white)',
                        border: '1px solid var(--fade-grey)'
                      }"
                    >
                      <slot name="tsub" :rowData="item"></slot>
                    </div>
                  </td>
                </tr>
              </template>
            </template>

            <template v-if="filterRowCount">
              <tr
                v-for="(item, i) in props.footerRows"
                :key="i"
                class="sticky-table-footer"
              >
                <td
                  v-if="extracolumnlength > 0"
                  :colspan="extracolumnlength"
                ></td>
                <template v-for="col in props.columns">
                  <td
                    v-if="!col.hide && !col.dataOnly"
                    :key="col.field"
                    :class="[col.cellClass ? col.cellClass : '']"
                    :style="{
                      maxWidth: props.truncate ? col.maxWidth : undefined
                    }"
                  >
                    <template
                      v-if="item.cells.find((x: any) => x.field == col.field)"
                    >
                      <truncated-cell
                        :value="
                          item.cells.find((x: any) => x.field == col.field).text
                        "
                        :truncate="props.truncate"
                        :max-length="props.truncateMaxLength"
                        :html="false"
                      />
                    </template>
                  </td>
                </template>
              </tr>
            </template>
          </tbody>
        </table>

        <div
          v-if="props.loading && enableloadinganimation"
          class="bh-absolute bh-inset-0 bh-bg-blue-light/50 bh-grid bh-place-content-center dt-center-loading"
          :style="{
            height: Number(props.height.replace('px', '')) - 175 + 'px'
          }"
        >
          <slot name="loadercontent"></slot>
        </div>

        <div
          v-if="!filterRowCount && !props.loading"
          class="nodatacontent"
          :style="{
            height: Number(props.height.replace('px', '')) - 175 + 'px'
          }"
        >
          <slot name="nodatacontent"></slot>
        </div>
      </div>
    </div>

    <div
      v-if="props.pagination && (filterRowCount || props.alwaysShowPagination)"
      class="bh-pagination"
      :class="{
        'bh-pointer-events-none': props.loading,
        'sticky-footer': props.stickyFooter
      }"
    >
      <div
        class="bh-flex bh-items-center bh-flex-wrap bh-flex-col sm:bh-flex-row bh-gap-4"
      >
        <slot
          v-if="enablefooterpagination"
          name="footerpageinfo"
          :showPageSize="showPageSize"
          :pageSizeOptions="pageSizeOptions"
          :currentPageSize="currentPageSize"
          :setPageSize="setPageSize"
        ></slot>
        <slot
          v-if="enablefooterpagination"
          name="footerpagination"
          :currentPage="currentPage"
          :maxPage="maxPage"
          :nextPage="nextPage"
          :previousPage="previousPage"
        ></slot>
      </div>
    </div>
  </div>
</template>
