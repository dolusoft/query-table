<script setup lang="ts">
import { columnTypeOf, type FilterCondition } from '@dolusoft/query-protocol'
import {
  defineDataset,
  type DatasetField,
  type LocalQueryError
} from '@dolusoft/query-protocol/local'
import { DataTable } from '@dolusoft/query-table/data-table'
import { useLocalQuery } from '@dolusoft/query-table/local'
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  watch
} from 'vue'

import { Button } from '@/ui/button'
import { Label } from '@/ui/label'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'
import { Skeleton } from '@/ui/skeleton'
import {
  QueryTable,
  type Column,
  type RowPinning,
  type RowSelection,
  type TableLabels,
  type TableQuery
} from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import {
  columnOf,
  currentDataset,
  makeQuery,
  wideColumns,
  type DemoRow
} from '../scenarios'
import { axes, defaultChoice, type AxisId } from '../scenarios/variations'

// The forms a table of rows already in the page takes (#204), one select per
// axis. Every variation is a prop or a slot of `DataTable`; the same props
// on `QueryTable`, fed by `useLocalQuery` and a dataset written by hand, draw
// the same table (C-127). The table is drawn again from scratch on every
// change, so each variation starts from the first page.
const data = currentDataset()
const [first, second] = data.searchFields
const { category, count } = data.fields
const source: DemoRow[] = data.createRows()
const byCategory = [...source].sort((a, b) =>
  String(a[category]).localeCompare(String(b[category]))
)

type Engine = 'data-table' | 'query-table'
const engine = ref<Engine>('data-table')
const engines: Record<Engine, string> = {
  'data-table': 'DataTable',
  'query-table': 'QueryTable + useLocalQuery'
}
const choice = reactive(defaultChoice())
const axisIds = Object.keys(axes) as AxisId[]
const optionsOf = (id: AxisId) =>
  Object.entries(axes[id].variations) as Array<
    [string, { label: string; note: string }]
  >
const noteOf = (id: AxisId) =>
  (
    axes[id].variations as Record<
      string,
      { label: string; note: string } | undefined
    >
  )[choice[id]]?.note ?? ''

// --------------------------------------------------------------- columns

const columnFor = (field: string): Column => {
  if (field === 'id') {
    return { field: 'id', title: 'ID', type: 'integer' }
  }
  if (field === count) {
    return { ...columnOf(data, count), type: 'integer' }
  }
  return { ...columnOf(data, field), type: 'string' }
}
const widths = ['5rem', '14rem', '12rem', '10rem', '7rem']

const startColumns = (): Column[] => {
  const fields = [...new Set(['id', first, second, category, count])]
  let columns = fields.map(columnFor)
  if (choice.columns === 'narrow') {
    const more = wideColumns(data).filter(
      column => !fields.includes(column.field)
    )
    columns = [...columns, ...more.map(column => columnFor(column.field))]
  }
  if (choice.columns === 'fixed') {
    columns = columns.map((column, index) => ({
      ...column,
      width: widths[index % widths.length]
    }))
  }
  if (choice.query === 'some') {
    columns = columns.map(column =>
      column.field === second
        ? { ...column, sortable: false, filterable: false }
        : column
    )
  }
  if (choice.columns === 'pinned') {
    columns = [
      ...columns,
      {
        field: 'actions',
        title: 'Actions',
        pinned: 'right',
        sortable: false,
        filterable: false
      }
    ]
  }
  return columns
}
const columns = shallowRef<Column[]>(startColumns())

// ------------------------------------------------------------------ rows

const allRows = computed<DemoRow[]>(() => {
  if (choice.state === 'empty') {
    return []
  }
  if (choice.rows === 'grouped') {
    return byCategory
  }
  if (choice.expand === 'open') {
    return source.map((row, index) =>
      index === 0 ? { ...row, isExpanded: true } : row
    )
  }
  return source
})

// ------------------------------------------------------- shared props

const sortable = computed(() => choice.query !== 'none')
const filterable = computed(
  () => choice.query !== 'none' && choice.query !== 'sort'
)
const search = computed(() =>
  choice.query === 'search' ? [first, second] : undefined
)
const paginate = computed(() => choice.paging === 'pages')
const hasSubtable = computed(() => choice.expand !== 'none')

const conditionNames: Record<FilterCondition, string> = {
  Contains: 'İçerir',
  NotContains: 'İçermez',
  Equal: 'Eşittir (=)',
  NotEqual: 'Eşit değildir (≠)',
  StartsWith: 'İle başlar',
  EndsWith: 'İle biter',
  GreaterThan: 'Büyüktür (>)',
  GreaterThanOrEqual: 'Büyük veya eşittir (≥)',
  LessThan: 'Küçüktür (<)',
  LessThanOrEqual: 'Küçük veya eşittir (≤)',
  IsNull: 'Boş',
  IsNotNull: 'Boş değil',
  Between: 'Arasında'
}
const turkish: Partial<TableLabels> = {
  clearAllFilters: 'Tüm filtreleri temizle',
  expandRow: 'Satırı aç',
  filterInput: column => `${column} filtresi`,
  filterInputFrom: column => `${column} filtresi, başlangıç`,
  filterInputTo: column => `${column} filtresi, bitiş`,
  filterOptions: column => `${column} filtre seçenekleri`,
  resizeColumn: column => `${column} genişliği`,
  moveColumn: column => `${column} sütununu taşı`,
  filterCondition: condition => conditionNames[condition],
  boolAll: 'Tümü',
  boolTrue: 'Evet',
  boolFalse: 'Hayır',
  selectRow: 'Satırı seç',
  selectAllRows: 'Tüm satırları seç'
}

const selection = ref<RowSelection>({})
const selected = computed(
  () => Object.values(selection.value).filter(Boolean).length
)
const pinning = ref<RowPinning>({ top: [], bottom: [] })
const opened = ref<string | null>(null)

// The query error: a page the evaluator refuses (C-76), given as `query`.
const startQuery = (): TableQuery =>
  makeQuery({ page: choice.state === 'error' ? 0 : 1, pageSize: 5 })
const query = ref<TableQuery>(startQuery())

/** Entries with a value only: a prop left out stays left out (C-124). */
const defined = (entries: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined)
  )

const shared = computed(() =>
  defined({
    columns: columns.value,
    rowKey: 'id',
    sortable: sortable.value,
    filterable: filterable.value,
    pagination: paginate.value ? { pageSizeOptions: [5, 10, 20] } : undefined,
    virtual: choice.paging === 'virtual' ? true : undefined,
    hasSubtable: hasSubtable.value || undefined,
    expandMode: choice.expand === 'single' ? 'single' : undefined,
    rowExpandable:
      choice.expand === 'some'
        ? (row: DemoRow) => Number(row.id) % 2 === 1
        : undefined,
    selection: choice.selection === 'many' ? selection.value : undefined,
    'onUpdate:selection':
      choice.selection === 'many'
        ? (next: RowSelection) => (selection.value = next)
        : undefined,
    autoWidth: choice.columns === 'auto' || undefined,
    autoWidthMax: choice.columns === 'auto' ? 240 : undefined,
    resizable: choice.columns === 'resize' || undefined,
    'onUpdate:columns': (next: Column[]) => (columns.value = next),
    rowNavigation: choice.rows === 'keyboard' ? { focus: 'a' } : undefined,
    groupBy:
      choice.rows === 'grouped'
        ? (row: DemoRow) => String(row[category])
        : undefined,
    rowPinning: choice.rows === 'pinned' ? pinning.value : undefined,
    'onUpdate:rowPinning':
      choice.rows === 'pinned'
        ? (next: RowPinning) => (pinning.value = next)
        : undefined,
    header: choice.header === 'none' ? false : undefined,
    scrollBody: choice.header === 'scroll' || undefined,
    loading: choice.state === 'loading' || undefined,
    labels: choice.text === 'turkish' ? turkish : undefined
  })
)

// ----------------------------------------------------- QueryTable path

// What DataTable builds from the columns (C-126), written by hand: one field
// per column with the column's type and flags, the search fields marked.
const dataset = computed(() => {
  const fields: Record<string, DatasetField<DemoRow>> = {}
  for (const column of columns.value) {
    fields[column.field] ??= {
      type: columnTypeOf(column),
      sortable: sortable.value && column.sortable !== false,
      filterable: filterable.value && column.filterable !== false,
      search: search.value?.includes(column.field) || undefined
    }
  }
  return defineDataset<DemoRow>({ key: 'id', fields })
})
// Evaluated only while QueryTable is drawn: with DataTable shown it would
// evaluate the rows a second time and log the query error twice.
const idle = makeQuery()
const local = useLocalQuery({
  allRows: () => (engine.value === 'query-table' ? allRows.value : []),
  query: () => (engine.value === 'query-table' ? query.value : idle),
  dataset,
  profile: 'tr-2',
  paginate
})

const bindings = computed(() => {
  if (engine.value === 'data-table') {
    return defined({
      ...shared.value,
      rows: allRows.value,
      search: search.value,
      paginate: paginate.value ? undefined : false,
      // The error variation gives the query; the others leave it to DataTable.
      query: choice.state === 'error' ? query.value : undefined,
      'onUpdate:query':
        choice.state === 'error'
          ? (next: TableQuery) => (query.value = next)
          : undefined
    })
  }
  const error = local.error.value
  return {
    ...shared.value,
    rows: error ? [] : local.rows.value,
    totalRows: error ? 0 : local.totalRows.value,
    query: query.value,
    'onUpdate:query': (next: TableQuery) => (query.value = next)
  }
})
const table = computed(() =>
  engine.value === 'data-table' ? DataTable : QueryTable
)

// A change of any select draws the table again from its start.
const drawn = ref(0)
watch([engine, () => ({ ...choice })], () => {
  columns.value = startColumns()
  query.value = startQuery()
  selection.value = {}
  pinning.value = { top: [], bottom: [] }
  opened.value = null
  drawn.value++
})

// ---------------------------------------------------------- slot parts

const errorText = (error: LocalQueryError) =>
  `Query error: ${error.code} (${error.field ?? error.path ?? 'query'}).`

// Content fetched when a row opens: the slot content mounts with the row.
const LazyDetail = defineComponent({
  props: { row: { type: Object, required: true } },
  setup(props) {
    const lines = ref<string[] | null>(null)
    const timer = setTimeout(() => {
      lines.value = data.detail
        .rows(props.row as DemoRow)
        .map(detail => data.describe(detail))
    }, 300)
    onBeforeUnmount(() => clearTimeout(timer))
    return () =>
      lines.value === null
        ? h('p', { class: 'text-sm text-muted-foreground' }, 'Loading details…')
        : h(
            'ul',
            { class: 'list-disc pl-5 text-sm' },
            lines.value.map(line => h('li', line))
          )
  }
})
const detailQuery = makeQuery({ pageSize: 10 })
const detailColumns = data.detail.columns()
const linkCell = computed(
  () => choice.rows === 'link' || choice.rows === 'keyboard'
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div class="flex flex-col gap-1">
        <Label for="variation-engine">Table</Label>
        <NativeSelect id="variation-engine" v-model="engine" size="sm">
          <NativeSelectOption
            v-for="(label, value) in engines"
            :key="value"
            :value="value"
          >
            {{ label }}
          </NativeSelectOption>
        </NativeSelect>
        <p class="text-xs text-muted-foreground">
          The same props; QueryTable gets its rows from useLocalQuery.
        </p>
      </div>
      <div v-for="id in axisIds" :key="id" class="flex flex-col gap-1">
        <Label :for="`variation-${id}`">{{ axes[id].title }}</Label>
        <NativeSelect :id="`variation-${id}`" v-model="choice[id]" size="sm">
          <NativeSelectOption
            v-for="[value, variation] in optionsOf(id)"
            :key="value"
            :value="value"
          >
            {{ variation.label }}
          </NativeSelectOption>
        </NativeSelect>
        <p class="text-xs text-muted-foreground">
          <template v-for="(part, index) in noteOf(id).split('`')" :key="index">
            <code v-if="index % 2 === 1">{{ part }}</code>
            <template v-else>{{ part }}</template>
          </template>
        </p>
      </div>
    </div>

    <div
      v-if="choice.selection === 'many' || opened"
      class="flex items-center gap-3 text-sm"
    >
      <template v-if="choice.selection === 'many'">
        <span data-testid="selected-count">{{ selected }} selected</span>
        <Button
          size="sm"
          variant="outline"
          :disabled="selected === 0"
          @click="selection = {}"
          >Clear selection</Button
        >
      </template>
      <span v-if="opened" data-testid="opened-row"
        >Opened row {{ opened }}</span
      >
    </div>

    <div
      :class="[
        'variation-box rounded-md',
        choice.paging === 'virtual' &&
          'max-h-[28rem] overflow-y-auto [&_.qt-table]:table-fixed',
        choice.header === 'scroll' &&
          '[&_.qt-table]:w-max [&_.qt-table]:min-w-full [&_.qt-table-body]:max-h-[24rem]',
        choice.columns === 'narrow' && 'max-w-[36rem]'
      ]"
    >
      <component :is="table" :key="drawn" v-bind="bindings">
        <template v-if="choice.query === 'search'" #toolbar="bar">
          <input
            class="mb-2 rounded border px-3 py-2"
            type="search"
            aria-label="Search"
            placeholder="Search"
            :value="bar.search"
            @input="bar.setSearch(($event.target as HTMLInputElement).value)"
            @keydown.enter="bar.applySearch()"
          />
        </template>
        <template v-if="filterable" #filter-menu="menu">
          <FilterMenu :menu="menu" />
        </template>
        <template v-if="hasSubtable" #subtable="{ row }">
          <div class="py-2 pl-6">
            <QueryTable
              v-if="choice.expand === 'nested'"
              :query="detailQuery"
              :columns="detailColumns"
              :rows="data.detail.rows(row)"
              :row-key="data.detail.key"
            />
            <LazyDetail v-else-if="choice.expand === 'lazy'" :row="row" />
            <p v-else class="text-sm text-muted-foreground">
              {{ data.detail.title(row) }}
            </p>
          </div>
        </template>
        <template v-if="linkCell" #[`cell-${first}`]="{ row, cellValue }">
          <a
            :href="`#row-${row.id}`"
            @click.prevent="opened = String(row.id)"
            >{{ cellValue }}</a
          >
        </template>
        <template
          v-if="choice.rows === 'pinned'"
          #[`cell-${first}`]="{ cellValue, rowPinned, pinRow }"
        >
          <span class="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              :aria-pressed="rowPinned === 'top'"
              @click="pinRow(rowPinned === 'top' ? false : 'top')"
              >Pin</Button
            >
            {{ cellValue }}
          </span>
        </template>
        <template v-if="choice.columns === 'pinned'" #cell-actions="{ row }">
          <Button size="sm" variant="outline" @click="opened = String(row.id)"
            >Open</Button
          >
        </template>
        <template
          v-if="choice.rows === 'grouped'"
          #group="{ groupKey, count: size }"
        >
          {{ groupKey }} · {{ size }}
        </template>
        <template v-if="choice.state === 'loading'" #loading>
          <div class="flex flex-col gap-2 py-2">
            <Skeleton v-for="line in 3" :key="line" class="h-4 w-full" />
          </div>
        </template>
        <template #empty>
          <span
            v-if="engine === 'query-table' && local.error.value"
            role="alert"
            >{{ errorText(local.error.value) }}</span
          >
          <template v-else>No rows to show.</template>
        </template>
        <template #error="{ error }">
          <span role="alert">{{ errorText(error) }}</span>
        </template>
        <template v-if="paginate" #pagination="page">
          <TablePager :page="page" />
        </template>
      </component>
    </div>
  </div>
</template>
