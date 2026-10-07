<script setup lang="ts">
import { InboxIcon } from '@lucide/vue'
import { ref } from 'vue'

import { Button } from '@/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/ui/empty'
import { Spinner } from '@/ui/spinner'
import { QueryTable } from '@dolusoft/query-table'

import TablePager from '../harness/TablePager.vue'
import { currentDataset, listColumns, makeQuery } from '../scenarios'

// The `empty` slot shows whenever `rows` is empty, whatever `totalRows`
// says, unless `loading` is on: a table that is fetching is not empty yet
// (see the "Loading state" page).
const data = currentDataset()
const columns = listColumns(data)
const query = ref(makeQuery())
const loading = ref(false)
const totalRows = ref<number | null>(0)
const rows: Array<Record<string, unknown>> = []
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" @click="loading = !loading">
        loading: {{ loading }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        @click="totalRows = totalRows === 0 ? 120 : 0"
      >
        totalRows: {{ totalRows }}
      </Button>
    </div>
    <QueryTable
      v-model:query="query"
      :columns="columns"
      :rows="rows"
      :total-rows="totalRows"
      :loading="loading"
    >
      <!-- shadcn-vue Empty: the consumer draws the empty state. -->
      <template #empty>
        <Empty class="p-6 md:p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No {{ data.noun.many }} yet</EmptyTitle>
            <EmptyDescription>
              Rows that the server sends show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </template>
      <template #loading>
        <span class="inline-flex items-center gap-2 text-muted-foreground">
          <Spinner />
          Loading…
        </span>
      </template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
  </div>
</template>
