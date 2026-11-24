<script setup lang="ts">
import { computed, ref } from 'vue'

import { Button } from '@/ui/button'
import {
  type Column,
  QueryTable,
  type RowSelection,
  type TableQuery
} from '@dolusoft/query-table'

// Administrators: a locked account takes no part in a bulk action, so
// `row-selectable` keeps it out (C-130). Its checkbox is disabled and select
// all skips it. Locking an account that is selected keeps its key in the
// selection, checked and disabled: the table never drops a key, so the page
// leaves locked accounts out of the action itself.
interface Admin {
  id: number
  name: string
  role: string
  status: 'Active' | 'Locked'
}

const admins = ref<Admin[]>([
  { id: 1, name: 'admin', role: 'Built-in', status: 'Locked' },
  { id: 2, name: 'security-1', role: 'Security', status: 'Active' },
  { id: 3, name: 'network-1', role: 'Network', status: 'Active' },
  { id: 4, name: 'auditor', role: 'Audit', status: 'Locked' },
  { id: 5, name: 'network-2', role: 'Network', status: 'Active' }
])

const columns: Column[] = [
  { field: 'name', title: 'Account' },
  { field: 'role', title: 'Role' },
  { field: 'status', title: 'Status' }
]
const query = ref<TableQuery>({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: []
})
const selection = ref<RowSelection>({})

const rowSelectable = (row: Admin) => row.status !== 'Locked'

const selected = computed(() => Object.keys(selection.value).length)
/** The accounts the bulk action acts on: selected and not locked. */
const actionable = computed(() =>
  admins.value.filter(
    admin => selection.value[admin.id] && rowSelectable(admin)
  )
)

const networkOne = computed(() => admins.value[2])
const toggleLock = () => {
  admins.value = admins.value.map(admin =>
    admin.id === 3
      ? { ...admin, status: admin.status === 'Locked' ? 'Active' : 'Locked' }
      : admin
  )
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <span data-testid="selected-count">{{ selected }} selected</span>
      <Button size="sm" variant="outline" :disabled="actionable.length === 0"
        >Reset password of {{ actionable.length }}</Button
      >
      <Button size="sm" variant="ghost" @click="toggleLock"
        >{{ networkOne.status === 'Locked' ? 'Unlock' : 'Lock' }}
        {{ networkOne.name }}</Button
      >
    </div>
    <QueryTable
      v-model:query="query"
      v-model:selection="selection"
      :columns="columns"
      :rows="admins"
      :total-rows="admins.length"
      row-key="id"
      :row-selectable="rowSelectable"
    />
  </div>
</template>
