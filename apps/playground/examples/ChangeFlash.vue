<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'

import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'
import {
  QueryTable,
  type Column,
  type FlashOptions,
  type RowPinning,
  type RowsUpdate,
  type TableQuery
} from '@dolusoft/query-table'

import {
  currentDataset,
  listColumns,
  makeQuery,
  queryDemoRows,
  type DemoRow
} from '../scenarios'
import { round2, seeded } from '../scenarios/random'

// `flash` marks what changed while the query stays the same: a row whose
// key is new and a cell whose `field` value changed. The table finds the
// change by comparing each new `rows` with the one before (by `row-key`);
// the page only hands over new rows, a new object for each changed row.
// The table writes `data-flash` and, for a row that scrolls back into the
// window, the time already gone; the skin draws the flash and sets its
// length with `--qt-flash-duration`, and a reduced-motion skin turns it off.
//
// A sort, a filter or a page answer never flashes: the first rows after a
// query change are a baseline. `rows-update` says it exactly (`live` for a
// change, `snapshot` for an answer); without it the table guesses from the
// query and `loading`, and an answer that comes late without `loading`, after
// a live change, may flash. "Slow answer without loading" shows that case.
//
// For measuring, the URL sets the controls: `?speed=100&mode=both&hint=1
// &slow=0&flash=1&run=1&rows=10000&burst=5`.
const data = currentDataset()
const base = data.createRows()
const route = useRoute()

const param = (name: string) => {
  const value = route.query[name]
  return typeof value === 'string' ? value : null
}
const numberParam = (
  name: string,
  fallback: number,
  min: number,
  max: number
) => {
  const value = Number(param(name))
  return param(name) !== null && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback
}
const flagParam = (name: string, fallback: boolean) =>
  param(name) === null ? fallback : param(name) === '1'

type Mode = 'top' | 'place' | 'both'
const modes: Record<Mode, string> = {
  top: 'New rows at top',
  place: 'Update in place',
  both: 'Both'
}
const modeParam = param('mode')

const count = numberParam('rows', 10_000, 100, 50_000)
const speed = ref(numberParam('speed', 500, 16, 1000))
const mode = ref<Mode>(
  modeParam !== null && modeParam in modes ? (modeParam as Mode) : 'both'
)
const burst = ref(numberParam('burst', 3, 1, 50))
const flashOn = ref(flagParam('flash', true))
const flashRows = ref(true)
const flashCells = ref(true)
const hint = ref(flagParam('hint', true))
const slowAnswer = ref(flagParam('slow', false))
const running = ref(flagParam('run', true))

const flash = computed<boolean | FlashOptions>(() =>
  flashOn.value ? { rows: flashRows.value, cells: flashCells.value } : false
)

// The ID column is pinned to the left; the first row is pinned to the top.
const columns: Column[] = listColumns(data).map(column =>
  column.field === 'id' ? { ...column, pinned: 'left' } : column
)
const pinning = shallowRef<RowPinning>({ top: ['1'], bottom: [] })

// The server's rows: the dataset repeated under new keys.
let store: DemoRow[] = Array.from({ length: count }, (_, i) => ({
  ...base[i % base.length],
  id: i + 1
}))
let nextId = count + 1
const random = seeded(7)
const { count: countField, amount: amountField } = data.fields

// One page holds every row; `virtual` keeps the DOM small.
const query = ref<TableQuery>(makeQuery({ pageSize: count }))
const shown = ref<TableQuery>(query.value)
const rows = shallowRef<DemoRow[]>([])
const totalRows = ref(0)
const loading = ref(false)
const update = ref<RowsUpdate>('snapshot')
const changes = ref(0)

const publish = (kind: RowsUpdate) => {
  const answer = queryDemoRows(store, shown.value)
  update.value = kind
  rows.value = answer.rows
  totalRows.value = answer.totalRows
}
publish('snapshot')

// A live change: new rows at the top of the server's list (the oldest leave
// at the end, but the pinned row stays), or a new object with new values for
// a few rows, the pinned row now and then.
const pinnedId = 1
const changeRow = (row: DemoRow): DemoRow => {
  const amount = Number(row[amountField])
  const scaled = amount * (0.9 + random.next() * 0.2)
  return {
    ...row,
    [countField]: Math.max(0, Number(row[countField]) + random.int(-5, 5)),
    // A whole amount (bytes) stays whole.
    [amountField]: Number.isInteger(amount)
      ? Math.round(scaled)
      : round2(scaled)
  }
}
const tick = () => {
  const add = mode.value !== 'place'
  const change = mode.value !== 'top'
  for (let i = 0; i < burst.value; i++) {
    if (add) {
      const row = { ...base[random.int(0, base.length - 1)], id: nextId++ }
      const last = store.length - 1
      const drop = store[last].id === pinnedId ? last - 1 : last
      store = [row, ...store.slice(0, drop), ...store.slice(drop + 1)]
    }
    if (change) {
      const index =
        random.int(0, 9) === 0
          ? store.findIndex(row => row.id === pinnedId)
          : random.int(0, Math.min(store.length, 60) - 1)
      store = store.slice()
      store[index] = changeRow(store[index])
    }
  }
  changes.value += burst.value
  publish('live')
}

let timer: ReturnType<typeof setTimeout> | null = null
const schedule = () => {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  if (running.value) {
    timer = setTimeout(() => {
      timer = null
      tick()
      schedule()
    }, speed.value)
  }
}
watch([running, speed], schedule, { immediate: true })
onBeforeUnmount(() => {
  if (timer !== null) {
    clearTimeout(timer)
  }
})

// A sort or a filter: the answer comes later. With `loading` on (the usual
// case) the table knows it is an answer; the slow case keeps `loading` off
// and lets live changes for the old query arrive meanwhile.
let latest = 0
const onQuery = (next: TableQuery) => {
  query.value = next
  const id = ++latest
  const slow = slowAnswer.value
  loading.value = !slow
  setTimeout(
    () => {
      if (id !== latest) {
        return
      }
      loading.value = false
      shown.value = next
      publish('snapshot')
    },
    slow ? 1200 : 300
  )
}
const rowsUpdate = computed(() => (hint.value ? update.value : undefined))
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        <Checkbox v-model="flashOn" />
        Flash
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="flashRows" :disabled="!flashOn" />
        New rows
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="flashCells" :disabled="!flashOn" />
        Changed cells
      </Label>
      <Label class="font-normal">
        Changes
        <NativeSelect
          v-model="mode"
          size="sm"
          class="[&_select]:h-11 lg:pointer-fine:[&_select]:h-8"
        >
          <NativeSelectOption
            v-for="(label, value) in modes"
            :key="value"
            :value="value"
          >
            {{ label }}
          </NativeSelectOption>
        </NativeSelect>
      </Label>
      <Label class="font-normal">
        Every
        <input
          v-model.number="speed"
          type="range"
          min="16"
          max="1000"
          step="1"
          class="w-36 accent-primary"
          aria-label="Milliseconds between changes"
        />
        <span class="w-16 tabular-nums">{{ speed }} ms</span>
      </Label>
      <Button
        variant="outline"
        size="sm"
        class="min-h-11 lg:pointer-fine:min-h-0"
        @click="running = !running"
      >
        {{ running ? 'Pause' : 'Resume' }}
      </Button>
    </div>
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        <Checkbox v-model="hint" />
        Pass <code>rows-update</code>
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="slowAnswer" />
        Slow answer without <code>loading</code>
      </Label>
      <span class="text-muted-foreground" aria-live="off">
        {{ changes }} changes, {{ totalRows }} {{ data.noun.many }}
      </span>
    </div>
    <div
      class="flash-box max-h-[28rem] overflow-y-auto rounded-md [&_.qt-table]:table-fixed"
    >
      <QueryTable
        v-model:row-pinning="pinning"
        :query="query"
        :columns="columns"
        :rows="rows"
        :total-rows="totalRows"
        :loading="loading"
        :flash="flash"
        :rows-update="rowsUpdate"
        :virtual="{ overscan: 10 }"
        row-key="id"
        sortable
        filterable
        @update:query="onQuery"
      />
    </div>
  </div>
</template>
