<script setup lang="ts">
import { ref } from 'vue'

import { type Column, QueryTable, type TableQuery } from '@dolusoft/query-table'

// A grouped report: the five largest groups, then one "Others" row that
// sums the rest. `row-kind` names the kind of a row (`data-row-kind`); the
// page's CSS gives that row its look (here italic, with a line above it).
// `row-expandable` keeps the "Others" row closed: it has no expand button
// and never draws the `subtable` slot.
interface GroupRow {
  id: string
  group: string
  events: number
  others?: boolean
}

const groups: GroupRow[] = [
  { id: 'web', group: 'web-01', events: 4210 },
  { id: 'db', group: 'db-01', events: 3180 },
  { id: 'fw', group: 'fw-edge', events: 2950 },
  { id: 'mail', group: 'mail-01', events: 1420 },
  { id: 'vpn', group: 'vpn-gw', events: 980 },
  { id: 'others', group: 'Others (14 groups)', events: 2365, others: true }
]

const columns: Column[] = [
  { field: 'group', title: 'Group' },
  { field: 'events', title: 'Events', type: 'integer' }
]
const query = ref<TableQuery>({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: []
})

const rowKind = (row: GroupRow) => (row.others ? 'others' : undefined)
const rowExpandable = (row: GroupRow) => !row.others
</script>

<template>
  <div
    class="[&_tr[data-row-kind=others]>td]:border-t-2 [&_tr[data-row-kind=others]>td]:italic"
  >
    <QueryTable
      v-model:query="query"
      :columns="columns"
      :rows="groups"
      :total-rows="groups.length"
      row-key="id"
      has-subtable
      :row-kind="rowKind"
      :row-expandable="rowExpandable"
    >
      <template #subtable="{ row }">
        <p class="py-2 pl-6 text-sm text-muted-foreground">
          Events of {{ (row as GroupRow).group }} by hour.
        </p>
      </template>
    </QueryTable>
  </div>
</template>
