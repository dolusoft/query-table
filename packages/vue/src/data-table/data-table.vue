<script setup lang="ts" generic="T extends object">
import { columnTypeOf, sameQuery } from '@dolusoft/query-protocol'
import type { Dataset, SemanticsProfile } from '@dolusoft/query-protocol/local'
import {
  camelize,
  computed,
  getCurrentInstance,
  shallowRef,
  useTemplateRef,
  watch
} from 'vue'

import type { DataTableEmits, DataTableProps, DataTableSlots } from './contract'
import {
  datasetOf,
  datasetSpecOf,
  sameSpec,
  type DatasetSpec
} from './derive-dataset'
import type {
  Column,
  ColumnChangeReason,
  QueryChangeReason,
  QueryTableExpose,
  RowsUpdate,
  TableQuery
} from '../contract'
import { QueryTable } from '../index'
import { useLocalQuery } from '../local'

// `useLocalQuery` and `QueryTable` side by side (ADR 0021, K319-1): no
// markup, no table state and no table behavior of its own.
defineOptions({ name: 'DataTable', inheritAttrs: false })

const props = withDefaults(defineProps<DataTableProps<T>>(), {
  query: undefined,
  profile: 'tr-2',
  search: undefined,
  paginate: true,
  dataset: undefined
})

const emit = defineEmits<DataTableEmits<T>>()

const slots = defineSlots<DataTableSlots<T>>()

// The query (C-125): the consumer's when given, else held here. Until the
// first update the held query is the start query, which follows
// `pageSizeOptions`; while the consumer gives one, the held query is dropped.
const start = computed<TableQuery>(previous => {
  const pageSize = props.pagination?.pageSizeOptions?.[0] ?? 10
  return previous?.pageSize === pageSize
    ? previous
    : { page: 1, pageSize, sort: null, filters: [] }
})
const held = shallowRef<TableQuery | null>(null)
watch(
  () => props.query !== undefined,
  given => {
    if (given) {
      held.value = null
    }
  }
)
const query = computed(() => props.query ?? held.value ?? start.value)
const onQuery = (next: TableQuery, reason: QueryChangeReason) => {
  if (props.query === undefined) {
    held.value = next
  }
  emit('update:query', next, reason)
}

// The dataset (C-126): built again only when what it is built from changes,
// compared by value.
const spec = computed<DatasetSpec>(previous => {
  const next = datasetSpecOf({
    rowKey: props.rowKey,
    columns: props.columns,
    search: props.search,
    sortable: props.sortable,
    filterable: props.filterable
  })
  return previous && sameSpec(previous, next) ? previous : next
})
const derived = computed(() => datasetOf<T>(spec.value))
const dataset = computed(() => props.dataset ?? derived.value)

const local = useLocalQuery<T>({
  allRows: () => props.rows,
  query,
  dataset,
  // Read on every evaluation, so a new profile evaluates again.
  get profile() {
    return props.profile
  },
  paginate: () => props.paginate
})

// The flash hint (C-124): a new context is a snapshot; a new page in the
// same context comes from the source. The query is compared by value, so a
// new but equal query object is the same context.
interface Context {
  query: TableQuery
  dataset: Dataset<T>
  profile: SemanticsProfile
  paginate: boolean
}
const drawn = computed<{ rows: T[]; hint: RowsUpdate; context: Context }>(
  previous => {
    const context: Context = {
      query: query.value,
      dataset: dataset.value,
      profile: props.profile,
      paginate: props.paginate
    }
    const before = previous?.context
    const same =
      before !== undefined &&
      sameQuery(before.query, context.query) &&
      before.dataset === context.dataset &&
      before.profile === context.profile &&
      before.paginate === context.paginate
    return { rows: local.rows.value, hint: same ? 'live' : 'snapshot', context }
  }
)

// An `ip` column is not a field (C-118, C-126), so the table offers no sort
// and no filter on it. `update:columns` gives the consumer's own `sortable`
// and `filterable` back, so the change never reaches the consumer's columns.
const isIp = (column: Column) => columnTypeOf(column) === 'ip'
const closed = (column: Column) =>
  isIp(column) && (column.sortable !== false || column.filterable !== false)
const columns = computed(() =>
  props.columns.some(closed)
    ? props.columns.map(column =>
        closed(column)
          ? { ...column, sortable: false, filterable: false }
          : column
      )
    : props.columns
)
const onColumns = (next: Column[], reason: ColumnChangeReason) => {
  const drawnColumns = columns.value
  const originals = new Map(
    props.columns.filter(closed).map(column => [column.field, column])
  )
  const restored = next.map(column => {
    const original = originals.get(column.field)
    if (!original || !isIp(column)) {
      return column
    }
    if (drawnColumns.includes(column)) {
      return original
    }
    const copy: Column = { ...column }
    for (const key of ['sortable', 'filterable'] as const) {
      if (key in original) {
        copy[key] = original[key]
      } else {
        delete copy[key]
      }
    }
    return copy
  })
  emit('update:columns', restored, reason)
}

// What the consumer gave reaches QueryTable as given; what it left out is
// left out, so QueryTable applies its own default (C-124). A declared prop
// is passed as Vue read it (`sortable=""` is `true`); any other attribute
// keeps its name (`data-testid`, `aria-label`).
const instance = getCurrentInstance()!
const own = new Set([
  'columns',
  'query',
  'rows',
  'profile',
  'search',
  'paginate',
  'dataset',
  'totalRows',
  'cursors',
  'infinite',
  'rowsUpdate'
])
const reserved = new Set(['key', 'ref', 'ref_for', 'ref_key'])
const passed = (): Record<string, unknown> => {
  const raw = instance.vnode.props ?? {}
  const declared = props as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    if (reserved.has(key) || key.startsWith('onVnode')) {
      continue
    }
    if (/^on[A-Z]/.test(key)) {
      // `update:query` and `update:columns`, `.once` included, are emitted
      // by DataTable itself.
      if (!/^onUpdate:(query|columns)/.test(key)) {
        out[key] = raw[key]
      }
      continue
    }
    const name = camelize(key)
    if (own.has(name)) {
      continue
    }
    if (name in declared) {
      out[name] = declared[name]
    } else {
      out[key] = raw[key]
    }
  }
  return out
}

// The slots QueryTable gets: the consumer's, without `error`, without
// `pagination` when nothing is paged, and with `empty` replaced while the
// evaluator reports an error and an `error` slot is given.
const showError = () => local.error.value !== null && slots.error !== undefined
const slotNames = () =>
  Object.keys(slots).filter(
    name =>
      name !== 'error' &&
      !(name === 'pagination' && !props.paginate) &&
      !(name === 'empty' && showError())
  ) as Array<keyof DataTableSlots<T>>

const table = useTemplateRef<QueryTableExpose>('table')
const exposed: QueryTableExpose = {
  collapseAll: () => table.value?.collapseAll(),
  expandAll: () => table.value?.expandAll(),
  focusFilter: field => table.value?.focusFilter(field) ?? false,
  flushPendingFilters: () => table.value?.flushPendingFilters(),
  scrollToIndex: (index, options) => table.value?.scrollToIndex(index, options),
  loadMore: () => table.value?.loadMore(),
  measureColumnWidths: fields => table.value?.measureColumnWidths(fields) ?? {}
}
defineExpose(exposed)
</script>

<template>
  <QueryTable
    ref="table"
    v-bind="passed()"
    :columns="columns"
    :query="query"
    :rows="drawn.rows"
    :total-rows="local.totalRows.value"
    :rows-update="drawn.hint"
    @update:query="onQuery"
    @update:columns="onColumns"
  >
    <template v-for="name in slotNames()" :key="name" #[name]="scope">
      <slot :name="name" v-bind="scope ?? {}" />
    </template>
    <template v-if="showError()" #empty>
      <slot name="error" :error="local.error.value!" />
    </template>
  </QueryTable>
</template>
