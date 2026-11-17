<script setup lang="ts" generic="T extends object">
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

// The query (C-125): the consumer's when given, else held here. While the
// consumer gives one, the held query is dropped back to the start query.
const startQuery = (): TableQuery => ({
  page: 1,
  pageSize: props.pagination?.pageSizeOptions?.[0] ?? 10,
  sort: null,
  filters: []
})
const held = shallowRef<TableQuery>(startQuery())
watch(
  () => props.query !== undefined,
  given => {
    if (given) {
      held.value = startQuery()
    }
  }
)
const query = computed(() => props.query ?? held.value)
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
// same context comes from the source.
let context: readonly unknown[] = []
const drawn = computed(() => {
  const rows = local.rows.value
  const next = [query.value, dataset.value, props.profile, props.paginate]
  const same = next.every((value, index) => value === context[index])
  context = next
  const hint: RowsUpdate = same ? 'live' : 'snapshot'
  return { rows, hint }
})

// What the consumer gave reaches QueryTable as given; what it left out is
// left out, so QueryTable applies its own default (C-124). A declared prop
// is passed as Vue read it (`sortable=""` is `true`).
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
  'rowsUpdate',
  'onUpdate:query'
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
    const name = /^on[A-Z]/.test(key) ? key : camelize(key)
    if (own.has(name)) {
      continue
    }
    out[name] = name in declared ? declared[name] : raw[key]
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
  >
    <template v-for="name in slotNames()" :key="name" #[name]="scope">
      <slot :name="name" v-bind="scope ?? {}" />
    </template>
    <template v-if="showError()" #empty>
      <slot name="error" :error="local.error.value!" />
    </template>
  </QueryTable>
</template>
