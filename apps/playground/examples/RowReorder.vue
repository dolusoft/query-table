<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  type Column,
  QueryTable,
  type RowReorderPayload,
  type TableQuery
} from '@dolusoft/query-table'

// NTP servers are tried in order. A row's handle moves a server (C-133):
// drag it, or press ↑ ↓ Home End on it. The table emits `rowReorder` with
// the keys and moves nothing; the page puts the row in its place and
// numbers the order again, as it would write it to its API. A move means
// "put it here" only while the rows are laid out by their order, so sorting
// by the server name turns the handles off. The table announces nothing:
// the page says where the server went.
interface Server {
  id: number
  host: string
  order: number
}

const servers = ref<Server[]>([
  { id: 1, host: 'time.cloudflare.com', order: 1 },
  { id: 2, host: '0.pool.ntp.org', order: 2 },
  { id: 3, host: '1.pool.ntp.org', order: 3 },
  { id: 4, host: 'time.google.com', order: 4 },
  { id: 5, host: 'ntp.ubuntu.com', order: 5 }
])

const columns: Column[] = [
  { field: 'order', title: 'Order', type: 'integer' },
  { field: 'host', title: 'Server' }
]
const query = ref<TableQuery>({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: []
})

const byOrder = computed(
  () => query.value.sort === null || query.value.sort.field === 'order'
)
/** The rows as the server would answer the query: sorted, never reordered by the table. */
const rows = computed(() => {
  const sort = query.value.sort
  if (!sort) {
    return servers.value
  }
  const sign = sort.direction === 'asc' ? 1 : -1
  const field = sort.field as keyof Server
  return [...servers.value].sort(
    (a, b) =>
      sign *
      String(a[field]).localeCompare(String(b[field]), 'en', { numeric: true })
  )
})

const announcement = ref('')
const onRowReorder = (move: RowReorderPayload<Server>) => {
  const rest = rows.value.filter(server => server.id !== move.rowKey)
  const at = rest.findIndex(server => server.id === move.target)
  rest.splice(move.place === 'before' ? at : at + 1, 0, move.row)
  // With a descending order the first row drawn is the last one tried.
  const tried = query.value.sort?.direction === 'desc' ? rest.reverse() : rest
  servers.value = tried.map((server, i) => ({ ...server, order: i + 1 }))
  const moved = servers.value.find(server => server.id === move.rowKey)!
  announcement.value = `${moved.host} is now number ${moved.order}`
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-muted-foreground" data-testid="reorder-hint">
      {{
        byOrder
          ? 'Drag a server by its handle, or press ↑ ↓ Home End on the handle.'
          : 'Sorted by server: sort by order to move the servers.'
      }}
    </p>
    <QueryTable
      v-model:query="query"
      :columns="columns"
      :rows="rows"
      :total-rows="rows.length"
      row-key="id"
      sortable
      :row-reorderable="byOrder"
      @row-reorder="onRowReorder"
    />
    <p class="sr-only" aria-live="polite" data-testid="reorder-announcement">
      {{ announcement }}
    </p>
  </div>
</template>
