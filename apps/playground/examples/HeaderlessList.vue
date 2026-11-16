<script setup lang="ts">
import { ref, shallowRef, useTemplateRef } from 'vue'

import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import {
  QueryTable,
  type Column,
  type QueryTableExpose,
  type TableQuery
} from '@dolusoft/query-table'

import { makeQuery } from '../scenarios'
import { seeded } from '../scenarios/random'

// A message list: one column of text, grouped by day, needs no column title.
// `:header="false"` draws no `thead`, so the group row is the only heading
// and the page makes it sticky at the top of the box. Without the header
// nothing sorts or filters from the table; the page's query still applies.
// Pinning, `scroll-body` and `auto-width` are off, a column `width` goes on
// a `col`, and with `virtual` the row count has no header row.
interface Message {
  id: number
  day: string
  time: string
  text: string
}

const words = [
  'deploy',
  'started',
  'finished',
  'retry',
  'queue',
  'drained',
  'index',
  'rebuilt',
  'backup',
  'verified',
  'alert',
  'cleared'
]
const rng = seeded(135)
const pick = () => words[Math.floor(rng.next() * words.length)]
const messages = shallowRef<Message[]>(
  Array.from({ length: 600 }, (_, i) => {
    const day = 30 - Math.floor(i / 40)
    const minutes = (i % 40) * 17
    return {
      id: i + 1,
      day: `2026-10-${String(day).padStart(2, '0')}`,
      time: `${String(Math.floor(minutes / 60) + 8).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      text: `${pick()} ${pick()} ${pick()}`
    }
  })
)

const columns: Column[] = [{ field: 'time', width: '5rem' }, { field: 'text' }]
const query = ref<TableQuery>(makeQuery({ pageSize: 600 }))
const header = ref(false)
const table = useTemplateRef<QueryTableExpose>('table')
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        <Checkbox v-model="header" />
        Show the header
      </Label>
      <Button
        variant="outline"
        size="sm"
        class="min-h-11 lg:pointer-fine:min-h-0"
        @click="table?.scrollToIndex(300, { align: 'start' })"
      >
        Scroll to message 301
      </Button>
    </div>
    <div
      class="max-h-[24rem] overflow-y-auto rounded-md [&_.qt-group-row>th]:sticky [&_.qt-group-row>th]:top-0 [&_.qt-group-row>th]:z-10 [&_.qt-group-row>th]:bg-background [&_.qt-table]:table-fixed [&_.qt-table-responsive]:overflow-visible"
    >
      <QueryTable
        ref="table"
        v-model:query="query"
        :columns="columns"
        :rows="messages"
        :total-rows="messages.length"
        :group-by="(row: Message) => row.day"
        :header="header"
        aria-label="Messages"
        virtual
        row-key="id"
      >
        <template #group="{ groupKey, count }">
          {{ groupKey }} · {{ count }} messages
        </template>
      </QueryTable>
    </div>
  </div>
</template>
