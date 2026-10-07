<script setup lang="ts">
import { computed, ref } from 'vue'

import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import {
  QueryTable,
  type CursorQuery,
  type QueryChangeReason,
  type RowSelection
} from '@dolusoft/query-table'

import TablePager from '../harness/TablePager.vue'
import {
  columnOf,
  currentDataset,
  listColumns,
  useCursorServer
} from '../scenarios'

// Three features on one table. The query pages by cursor (`cursor` key):
// the server answers with the cursors of the page shown and the page passes
// them back as `cursors`. The toolbar search is typed text the table applies
// after `searchDebounce`. The selection is the page's, through
// `v-model:selection`; selecting a row never emits a query.
const data = currentDataset()
const columns = listColumns(data)
const { query, result } = useCursorServer(data.createRows(), data.searchFields)
const searchLabel = `Search ${data.searchFields
  .map(field => columnOf(data, field).title?.toLowerCase())
  .join(' or ')}`
const selection = ref<RowSelection>({})
const selected = computed(() => Object.keys(selection.value))
const lastReason = ref<QueryChangeReason | null>(null)

const onQuery = (next: CursorQuery, reason: QueryChangeReason) => {
  query.value = next
  lastReason.value = reason
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <QueryTable
      v-model:selection="selection"
      :query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="null"
      :cursors="result.cursors"
      :search-debounce="300"
      :pagination="{ pageSizeOptions: [5, 10, 20] }"
      row-key="id"
      sortable
      filterable
      @update:query="onQuery"
    >
      <template #toolbar="bar">
        <div class="flex flex-wrap items-center gap-2 pb-2">
          <Input
            class="search-input h-10 w-full sm:w-64 lg:h-8"
            type="search"
            :aria-label="searchLabel"
            :placeholder="searchLabel"
            :model-value="bar.search"
            @update:model-value="bar.setSearch(String($event))"
            @keydown.enter="bar.applySearch()"
          />
          <Button
            variant="outline"
            size="sm"
            class="min-h-10 lg:min-h-0"
            :disabled="selected.length === 0"
            @click="selection = {}"
          >
            Clear selection
          </Button>
        </div>
      </template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
    <dl class="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
      <dt class="text-muted-foreground">Last update</dt>
      <dd class="last-reason font-mono">{{ lastReason ?? 'none yet' }}</dd>
      <dt class="text-muted-foreground">Cursor asked</dt>
      <dd class="font-mono break-all">
        {{
          query.cursor
            ? `${query.cursor.direction} ${query.cursor.token}`
            : 'null (first page)'
        }}
      </dd>
      <dt class="text-muted-foreground">Selected keys</dt>
      <dd class="selected-keys flex flex-wrap gap-1">
        <Badge v-for="key in selected" :key="key" variant="secondary">{{
          key
        }}</Badge>
        <span v-if="selected.length === 0">none</span>
      </dd>
    </dl>
  </div>
</template>
