<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  shallowRef,
  useTemplateRef,
  watch
} from 'vue'

import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'
import {
  QueryTable,
  type Column,
  type QueryTableExpose,
  type TableQuery
} from '@dolusoft/query-table'

import { makeQuery } from '../scenarios'
import { seeded } from '../scenarios/random'

// A task monitor: every message of the live feed brings the whole task list
// again, a new array of new objects. `groupBy` draws one group row above
// each category; the rows come sorted by category, the table never
// reorders. The group rows are not rows of `rows`: the selection, the
// indexes and `scrollToIndex` count tasks only. The page makes the header
// and the group rows sticky in its own CSS; with `virtual` the table keeps
// the group row of the top group drawn, so the name stays while its tasks
// scroll by.
interface Task {
  workId: string
  workCategory: string
  name: string
  status: 'queued' | 'running' | 'done' | 'failed'
  progress: number
}

const categories = [
  'listener',
  'sign-exporter',
  'file-transfer',
  'pre-processor',
  'report',
  'archiver',
  'indexer',
  'notifier'
]
const statuses: Task['status'][] = ['queued', 'running', 'done', 'failed']

const rng = seeded(131)
const random = () => rng.next()
let next = 1
const newTask = (category: string): Task => {
  const id = next++
  return {
    workId: `w-${id}`,
    workCategory: category,
    name: `${category} #${id}`,
    status: statuses[Math.floor(random() * 3)],
    progress: Math.floor(random() * 100)
  }
}
const byCategory = (tasks: Task[]) =>
  [...tasks].sort(
    (a, b) =>
      categories.indexOf(a.workCategory) - categories.indexOf(b.workCategory)
  )

const count = ref(2000)
const tasks = shallowRef<Task[]>([])
const seed = () => {
  tasks.value = byCategory(
    Array.from({ length: count.value }, (_, i) =>
      newTask(categories[i % categories.length])
    )
  )
}
seed()
watch(count, seed)

/** One message of the feed: the whole list again, some tasks changed. */
const tick = () => {
  const list = tasks.value.map(task =>
    random() < 0.02
      ? {
          ...task,
          progress: Math.min(100, task.progress + 7),
          status: task.progress + 7 >= 100 ? ('done' as const) : task.status
        }
      : { ...task }
  )
  // A new task now and then, at the top of its category; a done one leaves.
  if (random() < 0.3) {
    const category = categories[Math.floor(random() * categories.length)]
    const at = list.findIndex(task => task.workCategory === category)
    list.splice(at < 0 ? list.length : at, 0, newTask(category))
  }
  if (random() < 0.3) {
    const at = list.findIndex(task => task.status === 'done')
    if (at >= 0) {
      list.splice(at, 1)
    }
  }
  tasks.value = list
}

const live = ref(false)
const rate = ref(200)
let timer = 0
watch(
  [live, rate],
  ([on, ms]) => {
    clearInterval(timer)
    if (on) {
      timer = window.setInterval(tick, ms)
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => clearInterval(timer))

const grouped = ref(true)
const narrow = ref(true)
const query = ref<TableQuery>(makeQuery({ pageSize: 100_000 }))
const selection = ref<Record<string, boolean>>({})
const selected = computed(
  () => Object.values(selection.value).filter(Boolean).length
)

const columns: Column[] = [
  { field: 'name', title: 'Task' },
  { field: 'status', title: 'Status', width: '7rem' },
  { field: 'progress', title: 'Progress', type: 'number', width: '6rem' }
]

const groupBy = (task: Task) => task.workCategory

// The sticky group rows go below the sticky header: the page measures it.
const box = useTemplateRef<HTMLElement>('box')
const headHeight = ref(0)
let headObserver: ResizeObserver | null = null
watch(box, element => {
  headObserver?.disconnect()
  const head = element?.querySelector('thead')
  if (head) {
    headObserver = new ResizeObserver(() => {
      headHeight.value = head.getBoundingClientRect().height
    })
    headObserver.observe(head)
  }
})
onBeforeUnmount(() => headObserver?.disconnect())

const table = useTemplateRef<QueryTableExpose>('table')
const jump = (category: string) => {
  const index = tasks.value.findIndex(task => task.workCategory === category)
  if (index >= 0) {
    table.value?.scrollToIndex(index, { align: 'start' })
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        Tasks
        <NativeSelect
          v-model="count"
          size="sm"
          class="[&_select]:h-11 lg:pointer-fine:[&_select]:h-8"
        >
          <NativeSelectOption :value="200">200</NativeSelectOption>
          <NativeSelectOption :value="2000">2 000</NativeSelectOption>
          <NativeSelectOption :value="10000">10 000</NativeSelectOption>
        </NativeSelect>
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="grouped" />
        Group by category
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="live" />
        Live feed
      </Label>
      <Label class="font-normal">
        Every
        <NativeSelect
          v-model="rate"
          size="sm"
          class="[&_select]:h-11 lg:pointer-fine:[&_select]:h-8"
        >
          <NativeSelectOption :value="50">50 ms</NativeSelectOption>
          <NativeSelectOption :value="200">200 ms</NativeSelectOption>
          <NativeSelectOption :value="1000">1 s</NativeSelectOption>
        </NativeSelect>
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="narrow" />
        Side panel width
      </Label>
      <span class="text-muted-foreground">{{ selected }} selected</span>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="category in categories"
        :key="category"
        variant="outline"
        size="sm"
        class="min-h-11 lg:pointer-fine:min-h-0"
        @click="jump(category)"
      >
        {{ category }}
      </Button>
    </div>
    <div
      ref="box"
      class="grouped-box max-h-[28rem] overflow-y-auto rounded-md [&_.qt-table]:table-fixed [&_.qt-table-responsive]:overflow-visible [&_.qt-group-row>th]:sticky [&_.qt-group-row>th]:z-10 [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20 [&_thead]:bg-background"
      :class="narrow ? 'max-w-[600px]' : ''"
      :style="{ '--head': `${headHeight}px` }"
    >
      <QueryTable
        ref="table"
        v-model:query="query"
        v-model:selection="selection"
        :columns="columns"
        :rows="tasks"
        :total-rows="tasks.length"
        :group-by="grouped ? groupBy : undefined"
        virtual
        flash
        rows-update="live"
        row-key="workId"
      >
        <template #group="{ groupKey, count: size }">
          <span class="flex items-center gap-2">
            {{ groupKey }}
            <Badge variant="secondary">{{ size }}</Badge>
          </span>
        </template>
      </QueryTable>
    </div>
  </div>
</template>

<style scoped>
.grouped-box :deep(.qt-group-row > th) {
  top: var(--head);
}
</style>
