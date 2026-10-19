<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'
import { QueryTable, type Column, type TableQuery } from '@dolusoft/query-table'

import { makeQuery } from '../scenarios'
import { seeded } from '../scenarios/random'

// Every data row is a component of its own (`TableRow` in Vue DevTools). A
// row is drawn again only when its row object, its own state (selection,
// expansion, flash) or something every row draws (columns, the set of cell
// slots) changes. The feed below replaces one task with a new object and
// keeps every other task by reference, so only that row is drawn again.
//
// The "Renders" column counts the calls of its own slot per task in a plain
// `Map`: written while the slot renders and not reactive, so counting draws
// none. The changed row's number goes up (twice with `flash`: once for the
// change, once when its flash ends); the others stay. A row that scrolls into
// the `virtual` window is mounted, which is a draw too.
//
// "New objects for every row" is the cost of not keeping references: the
// whole list as new objects, so every drawn row is drawn again. "Clock in
// the duration cell" reads a ticking clock in the running tasks' duration
// slot: a slot's reactive reads belong to its row, so only those rows are
// drawn each second. A value that every row's slot reads redraws every row;
// the clock belongs in the cells that show it.
interface Task {
  workId: string
  workCategory: string
  name: string
  status: 'queued' | 'running' | 'done'
  progress: number
  startedAt: number
  endedAt: number
}

const categories = ['listener', 'file-transfer', 'report', 'indexer']
const rng = seeded(311)
const random = () => rng.next()
const pick = <T,>(list: T[]): T => list[Math.floor(random() * list.length)]

const start = Date.now()
const newTask = (index: number): Task => {
  const category = categories[index % categories.length]
  const status = pick<Task['status']>(['queued', 'running', 'done'])
  const startedAt = start - Math.floor(random() * 600_000)
  return {
    workId: `w-${String(index + 1)}`,
    workCategory: category,
    name: `${category} #${String(index + 1)}`,
    status,
    progress: status === 'done' ? 100 : status === 'running' ? 40 : 0,
    startedAt,
    endedAt: status === 'done' ? startedAt + 90_000 : 0
  }
}
// Sorted by category: `groupBy` draws a group row above each run of a key.
const tasks = shallowRef<Task[]>(
  Array.from({ length: 400 }, (_, i) => newTask(i)).sort(
    (a, b) =>
      categories.indexOf(a.workCategory) - categories.indexOf(b.workCategory)
  )
)

// One change: a running task makes progress (and may finish), or a queued
// one starts. The changed task is a new object; a task changed in place
// would not be seen.
const advance = (task: Task): Task => {
  const now = Date.now()
  if (task.status === 'queued') {
    return { ...task, status: 'running', progress: 10, startedAt: now }
  }
  const progress = Math.min(100, task.progress + 10)
  return progress === 100
    ? { ...task, status: 'done', progress, endedAt: now }
    : { ...task, progress }
}

const newObjects = ref(false)
const lastChanged = ref('')
const change = () => {
  const list = tasks.value
  const running = list.filter(task => task.status === 'running')
  const queued = list.filter(task => task.status === 'queued')
  const target =
    running.length > 0 && (running.length >= 8 || queued.length === 0)
      ? pick(running)
      : pick(queued.length > 0 ? queued : list)
  const next = target.status === 'done' ? target : advance(target)
  lastChanged.value = next.name
  // Keep the unchanged tasks by reference; the switch shows the other way.
  tasks.value = list.map(task =>
    task === target ? next : newObjects.value ? { ...task } : task
  )
}

const running = ref(true)
const rate = ref(400)
let feed = 0
watch(
  [running, rate],
  ([on, ms]) => {
    clearInterval(feed)
    if (on) {
      feed = window.setInterval(change, ms)
    }
  },
  { immediate: true }
)

// The clock the duration slot reads, once a second.
const clockOn = ref(false)
const now = ref(Date.now())
const clock = window.setInterval(() => {
  now.value = Date.now()
}, 1000)
onBeforeUnmount(() => {
  clearInterval(feed)
  clearInterval(clock)
})

const duration = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(seconds / 60))}m ${String(seconds % 60).padStart(2, '0')}s`
}

// Not reactive on purpose: a count that drew its row would count itself.
const renders = new Map<string, number>()
const counted = (task: Task) => {
  const count = (renders.get(task.workId) ?? 0) + 1
  renders.set(task.workId, count)
  return count
}

const query = ref<TableQuery>(makeQuery({ pageSize: 100_000 }))
const columns: Column[] = [
  { field: 'name', title: 'Task' },
  { field: 'status', title: 'Status', width: '7rem' },
  { field: 'progress', title: 'Progress', type: 'number', width: '6rem' },
  { field: 'duration', title: 'Duration', width: '7rem' },
  { field: 'renders', title: 'Renders', type: 'integer', width: '6rem' }
]
const groupBy = (task: Task) => task.workCategory
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        <Checkbox v-model="running" />
        Live feed
      </Label>
      <Label class="font-normal">
        Every
        <NativeSelect
          v-model="rate"
          size="sm"
          class="[&_select]:h-11 lg:pointer-fine:[&_select]:h-8"
        >
          <NativeSelectOption :value="100">100 ms</NativeSelectOption>
          <NativeSelectOption :value="400">400 ms</NativeSelectOption>
          <NativeSelectOption :value="1000">1 s</NativeSelectOption>
        </NativeSelect>
      </Label>
      <Button
        variant="outline"
        size="sm"
        class="min-h-11 lg:pointer-fine:min-h-0"
        @click="change"
      >
        Change one task
      </Button>
    </div>
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        <Checkbox v-model="newObjects" />
        New objects for every row
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="clockOn" />
        Clock in the duration cell
      </Label>
      <span class="text-muted-foreground" aria-live="off">
        Last changed: {{ lastChanged || 'none yet' }}
      </span>
    </div>
    <div
      class="max-h-[28rem] overflow-y-auto rounded-md [&_.qt-table]:table-fixed"
    >
      <QueryTable
        v-model:query="query"
        :columns="columns"
        :rows="tasks"
        :total-rows="tasks.length"
        :group-by="groupBy"
        virtual
        flash
        rows-update="live"
        row-key="workId"
      >
        <template #group="{ groupKey, count }">
          <span class="flex items-center gap-2">
            {{ groupKey }}
            <Badge variant="secondary">{{ count }}</Badge>
          </span>
        </template>
        <template #cell-duration="{ row }">
          <span class="tabular-nums">
            <template v-if="(row as Task).status === 'done'">
              {{ duration((row as Task).endedAt - (row as Task).startedAt) }}
            </template>
            <template v-else-if="(row as Task).status === 'queued'">
              –
            </template>
            <template v-else-if="clockOn">
              {{ duration(now - (row as Task).startedAt) }}
            </template>
            <template v-else>running</template>
          </span>
        </template>
        <template #cell-renders="{ row }">
          <span class="tabular-nums">{{ counted(row as Task) }}</span>
        </template>
      </QueryTable>
    </div>
  </div>
</template>
