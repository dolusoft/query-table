<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'
import {
  QueryTable,
  type Column,
  type RowFocusPayload,
  type RowNavigationOptions,
  type TableQuery
} from '@dolusoft/query-table'

import { makeQuery } from '../scenarios'
import { seeded } from '../scenarios/random'

// An event log, like a decision trace viewer: events grouped by session,
// with note rows between them. Each event row draws a button, its focus
// target; ↑ and ↓ move between the events, Home and End jump to the ends,
// and the table passes over the group rows and the note rows (`skip`).
// With `virtual` an event out of view is drawn first, then focused by its
// key; the page selects the event on `rowFocus`, like a list box. The
// header and the group rows are sticky in the page's CSS; the focused row
// is never left under them.
interface Entry {
  id: string
  session: string
  kind: 'event' | 'note'
  title: string
  at: string
}

const actions = ['read', 'edit', 'test', 'review', 'commit', 'search', 'plan']
const count = ref(2000)
const entries = computed<Entry[]>(() => {
  const rng = seeded(134)
  const list: Entry[] = []
  for (let i = 0; i < count.value; i++) {
    const session = `s-${String(Math.floor(i / 40) + 1).padStart(3, '0')}`
    const note = i % 9 === 4
    const minutes = (i * 7) % 1440
    list.push({
      id: `e-${i + 1}`,
      session,
      kind: note ? 'note' : 'event',
      title: note
        ? `Note: ${actions[i % actions.length]} skipped`
        : `${rng.pick(actions)} #${i + 1}`,
      at: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    })
  }
  return list
})

const virtual = ref(true)
const grouped = ref(true)
const query = ref<TableQuery>(makeQuery({ pageSize: 100_000 }))
const columns: Column[] = [
  { field: 'title', title: 'Event' },
  { field: 'at', title: 'Time', width: '6rem' }
]

const navigation: RowNavigationOptions<Entry> = {
  focus: '[data-row]',
  skip: entry => entry.kind === 'note'
}
const groupBy = (entry: Entry) => entry.session
const kindOf = (entry: Entry) => entry.kind

const selected = ref<Entry | null>(null)
const lastKey = ref('')
const onRowFocus = ({ row, key }: RowFocusPayload<Entry>) => {
  selected.value = row
  lastKey.value = key
}

// Overlap the sticky header by one pixel, rounding down so a fractional
// header height cannot leave an unpainted seam between the two surfaces.
const box = useTemplateRef<HTMLElement>('box')
const headHeight = ref(0)
let headObserver: ResizeObserver | null = null
watch(box, element => {
  headObserver?.disconnect()
  const head = element?.querySelector('thead')
  if (head) {
    headObserver = new ResizeObserver(() => {
      headHeight.value = Math.max(
        0,
        Math.floor(head.getBoundingClientRect().height) - 1
      )
    })
    headObserver.observe(head)
  }
})
onBeforeUnmount(() => headObserver?.disconnect())
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        Entries
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
        <Checkbox v-model="virtual" />
        Virtual
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="grouped" />
        Group by session
      </Label>
      <span class="text-muted-foreground" aria-live="polite">
        <template v-if="selected">
          {{ selected.title }} ({{ selected.session }}, {{ selected.at }}) ·
          {{ lastKey }}
        </template>
        <template v-else>Focus an event and use ↑ ↓ Home End</template>
      </span>
    </div>
    <div
      ref="box"
      class="navigation-box max-h-[28rem] overflow-y-auto rounded-md [&_.qt-table]:table-fixed [&_.qt-table-responsive]:overflow-visible [&_.qt-group-row>th]:sticky [&_.qt-group-row>th]:z-10 [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20 [&_thead]:bg-background"
      :style="{ '--head': `${headHeight}px` }"
    >
      <QueryTable
        v-model:query="query"
        :columns="columns"
        :rows="entries"
        :total-rows="entries.length"
        :group-by="grouped ? groupBy : undefined"
        :row-kind="kindOf"
        :virtual="virtual"
        :row-navigation="navigation"
        row-key="id"
        @row-focus="onRowFocus"
      >
        <template #cell-title="{ row }">
          <button
            v-if="row.kind === 'event'"
            type="button"
            data-row
            class="w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-current="selected?.id === row.id ? 'true' : undefined"
            @click="selected = row"
          >
            {{ row.title }}
          </button>
          <span v-else class="text-muted-foreground italic">{{
            row.title
          }}</span>
        </template>
      </QueryTable>
    </div>
  </div>
</template>

<style scoped>
.navigation-box :deep(.qt-group-row > th) {
  top: var(--head);
}
</style>
