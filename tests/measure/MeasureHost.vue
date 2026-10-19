<script setup lang="ts">
import { computed, nextTick, ref, shallowRef } from 'vue'

import type { MeasureApi } from './measure-api'
import MeasureWrapper from './MeasureWrapper.vue'
import type { Column, TableQuery } from '../../packages/vue/src/contract'
import QueryTable from '../../packages/vue/src/index'

// A consumer that behaves like a server-backed page: it owns the query, and
// every `update:query` answers with the rows a server would send (filtered,
// sorted and cut to a page from `dataset`). It takes the time its own render
// needs for each answer (`applied`), forced through layout.
const props = withDefaults(
  defineProps<{
    dataset: Array<Record<string, unknown>>
    columns: Column[]
    initialQuery: TableQuery
    filterDebounce: number
    /** Collects the milliseconds each answer took to patch and lay out. */
    applied: number[]
    /** Reorder handles (the `move` scenario); the others keep them off. */
    reorderable?: boolean
    /** `flash` with `rowKey` (the `flash` scenario); the others keep it off. */
    flash?: boolean
    /** Groups the rows in runs of 13 (the `grouped` scenario, C-103). */
    grouped?: boolean
    /** `rowKey="id"` without `flash` (the row scenarios, C-106). */
    keyed?: boolean
    /** `rowsUpdate="live"` (with `flash`). */
    live?: boolean
    /** `virtual` in a 400px scroll box. */
    virtual?: boolean
    /** `v-model:selection`. */
    selectable?: boolean
    /** `hasSubtable` with a `subtable` slot. */
    subtable?: boolean
    /** The table inside a wrapper that forwards its slots with a `v-for`. */
    forward?: boolean
    /** A `cell-age` slot that reads `clock` in rows 0 to 4 (C-107). */
    clockCells?: boolean
    /**
     * The rows in a `shallowRef`. Off, they are in a `ref`, as in 3.10 and
     * in most consumers: the table gets reactive proxies of the rows.
     */
    shallowRows?: boolean
    /** The controls the row scenarios drive. */
    api?: (api: MeasureApi) => void
  }>(),
  {
    reorderable: false,
    flash: false,
    grouped: false,
    keyed: false,
    live: false,
    virtual: false,
    selectable: false,
    subtable: false,
    forward: false,
    clockCells: false,
    shallowRows: false,
    api: undefined
  }
)

// New rows (negative ids) join the first group.
const groupBy = (row: Record<string, unknown>) =>
  Math.max(0, Math.floor((Number(row.id) - 1) / 13))

// The consumer owns the layout too (`v-model:columns`).
const layout = shallowRef(props.columns)

// A cell value may be any type; its string form is what the table shows.
// eslint-disable-next-line @typescript-eslint/no-base-to-string
const text = (value: unknown) => String(value ?? '').toLowerCase()

const answer = (query: TableQuery) => {
  let found = props.dataset
  for (const rule of query.filters) {
    found = found.filter(row =>
      text(row[rule.field]).includes(text(rule.value))
    )
  }
  const sort = query.sort
  if (sort) {
    const sign = sort.direction === 'asc' ? 1 : -1
    found = [...found].sort(
      (a, b) =>
        sign *
        text(a[sort.field]).localeCompare(text(b[sort.field]), undefined, {
          numeric: true
        })
    )
  }
  const start = (query.page - 1) * query.pageSize
  return {
    total: found.length,
    rows: found.slice(start, start + query.pageSize)
  }
}

const query = ref(props.initialQuery)
const first = answer(props.initialQuery)
// A deep `ref` keeps the proxy of an unchanged row, so `replaceAt` and
// `sameObjects` hand the table the same objects for the rows they keep.
const rows = props.shallowRows ? shallowRef(first.rows) : ref(first.rows)
const total = ref(first.total)
// Flipped by the `.toggle-loading` button (the `loading` scenario).
const loading = ref(false)
const selection = shallowRef<Record<string, boolean>>({})
const clock = ref(0)
const own = ref(0)
const box = shallowRef<HTMLElement | null>(null)

// A live change under the same query (the `flash` scenario): a new row at
// the top and a new object with a new `age` for the first three rows.
let added = 0
const liveChange = () => {
  added++
  const fresh = { ...rows.value[0], id: -added, name: `New ${added}` }
  rows.value = [
    fresh,
    ...rows.value.map((row, index) =>
      index < 3 ? { ...row, age: Number(row.age) + 1 } : row
    )
  ]
}

props.api?.({
  replaceAt: index => {
    rows.value = rows.value.map((row, at) =>
      at === index ? { ...row, age: Number(row.age) + 100 } : row
    )
  },
  sameObjects: () => {
    rows.value = [...rows.value]
  },
  box: () => box.value,
  tick: () => {
    clock.value++
  },
  ownState: () => {
    own.value++
  }
})

// The props of the table. A setting a scenario does not use is left out,
// so the scenarios of 3.10 mount the table they mounted then.
const setLayout = (next: Column[]) => {
  layout.value = next
}
const setSelection = (next: Record<string, boolean>) => {
  selection.value = next
}
const tableProps = computed(() => ({
  columns: layout.value,
  'onUpdate:columns': setLayout,
  query: query.value,
  rows: rows.value,
  totalRows: total.value,
  loading: loading.value,
  sortable: true,
  filterable: true,
  reorderable: props.reorderable,
  filterDebounce: props.filterDebounce,
  flash: props.flash,
  rowKey: props.flash || props.keyed ? 'id' : undefined,
  groupBy: props.grouped ? groupBy : undefined,
  'onUpdate:query': update,
  // A long flash, so no flash ends while the scenario counts. On the root:
  // the skin sets the length there, so a value on a wrapper is not read.
  ...(props.flash ? { style: { '--qt-flash-duration': '60s' } } : {}),
  ...(props.live ? { rowsUpdate: 'live' as const } : {}),
  ...(props.virtual ? { virtual: true } : {}),
  ...(props.subtable ? { hasSubtable: true } : {}),
  ...(props.selectable
    ? {
        selection: selection.value,
        'onUpdate:selection': setSelection
      }
    : {})
}))

function update(next: TableQuery) {
  const started = performance.now()
  query.value = next
  const result = answer(next)
  rows.value = result.rows
  total.value = result.total
  void nextTick().then(() => {
    // Reading a layout property forces the style and layout work of the patch.
    void document.body.offsetHeight
    // The host reports into the caller's array on purpose.
    // eslint-disable-next-line vue/no-mutating-props
    props.applied.push(performance.now() - started)
  })
}
</script>

<template>
  <button type="button" class="toggle-loading" @click="loading = !loading">
    Loading
  </button>
  <button type="button" class="live-change" @click="liveChange">Change</button>
  <div
    ref="box"
    :style="virtual ? { height: '400px', overflowY: 'auto' } : undefined"
  >
    <!--
      One branch per slot set, so each branch has stable slots: a slot under
      `v-if` would make the table's slots dynamic and render the table on
      every render of this page. The wrapper forwards them dynamically on
      purpose (the Task Monitor's pattern).
    -->
    <MeasureWrapper v-if="forward" v-bind="tableProps" :tick="own">
      <template #pagination="page">
        <span class="page-info">Page {{ page.page }}</span>
      </template>
      <template #loading>Loading</template>
    </MeasureWrapper>
    <QueryTable v-else-if="subtable" v-bind="tableProps">
      <template #loading>Loading</template>
      <template #subtable="{ row }">Detail {{ row.id }}</template>
    </QueryTable>
    <QueryTable v-else-if="clockCells" v-bind="tableProps">
      <template #loading>Loading</template>
      <template #cell-age="{ row, rowIndex }">{{
        rowIndex < 5 ? `${row.age} ${clock}` : row.age
      }}</template>
    </QueryTable>
    <QueryTable v-else v-bind="tableProps">
      <template #pagination="page">
        <span class="page-info"
          >Page {{ page.page }} of {{ page.pageCount }}</span
        >
        <button
          type="button"
          class="next-page"
          :disabled="!page.canNext"
          @click="page.nextPage()"
        >
          Next
        </button>
      </template>
      <template #loading>Loading</template>
    </QueryTable>
  </div>
</template>
