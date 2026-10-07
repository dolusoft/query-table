<script setup lang="ts">
import { ref, shallowRef } from 'vue'

import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { Spinner } from '@/ui/spinner'
import {
  QueryTable,
  type QueryChangeReason,
  type TableQuery
} from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import {
  currentDataset,
  listColumns,
  makeQuery,
  queryDemoRows,
  type DemoRow
} from '../scenarios'

// `infinite` asks for the next page (`update:query`, reason `page`) when the
// end of `rows` comes near; the page appends the answer to its rows. Every
// other reason (sort, filter, search, page size) starts the list over. The
// table never adds rows and never keeps any. On an error the page keeps its
// rows and puts back the query of those rows; the `load-more` row offers
// the retry. With `virtual` the window keeps the DOM small as the list grows.
const data = currentDataset()
const columns = listColumns(data)
const allRows = data.createRows()

const shown = ref<TableQuery>(makeQuery({ pageSize: 25 }))
const query = ref<TableQuery>(shown.value)
const rows = shallowRef<DemoRow[]>(queryDemoRows(allRows, shown.value).rows)
const totalRows = ref<number | null>(null)
const loading = ref(false)
const failed = ref(false)
const failNext = ref(false)
const virtual = ref(true)
let latest = 0

const onQuery = (next: TableQuery, reason: QueryChangeReason) => {
  query.value = next
  const id = ++latest
  loading.value = true
  failed.value = false
  setTimeout(() => {
    if (id !== latest) {
      return
    }
    loading.value = false
    if (failNext.value) {
      failNext.value = false
      failed.value = true
      query.value = shown.value
      return
    }
    const answer = queryDemoRows(allRows, next)
    rows.value =
      reason === 'page' ? [...rows.value, ...answer.rows] : answer.rows
    shown.value = next
  }, 600)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        <Checkbox v-model="virtual" />
        Virtual rows
      </Label>
      <Label class="font-normal">
        <Checkbox v-model="failNext" />
        Fail the next request
      </Label>
      <span class="text-muted-foreground" aria-live="polite">
        {{ rows.length }} {{ data.noun.many }} loaded
      </span>
    </div>
    <div
      class="infinite-box max-h-[28rem] overflow-y-auto rounded-md [&_.qt-table]:table-fixed"
    >
      <QueryTable
        :query="query"
        :columns="columns"
        :rows="rows"
        :total-rows="totalRows"
        :loading="loading"
        :virtual="virtual"
        :infinite="{ threshold: 5 }"
        row-key="id"
        sortable
        filterable
        @update:query="onQuery"
      >
        <template #filter-menu="menu">
          <FilterMenu :menu="menu" />
        </template>
        <template #loading>
          <span class="inline-flex items-center gap-2">
            <Spinner /> Loading…
          </span>
        </template>
        <template #load-more="{ loadMore, canLoadMore }">
          <span v-if="failed" class="inline-flex items-center gap-2">
            The request failed.
            <Button
              variant="outline"
              size="sm"
              class="min-h-11 lg:pointer-fine:min-h-0"
              @click="loadMore()"
            >
              Try again
            </Button>
          </span>
          <Button
            v-else-if="canLoadMore"
            variant="ghost"
            size="sm"
            class="min-h-11 lg:pointer-fine:min-h-0"
            @click="loadMore()"
          >
            Load more
          </Button>
          <span v-else>End of the list.</span>
        </template>
      </QueryTable>
    </div>
  </div>
</template>
