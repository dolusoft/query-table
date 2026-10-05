<script setup lang="ts">
import { ref } from 'vue'

import { Button } from '@/ui/button'

import { QueryTable, type QueryTableExpose } from '../../src/index'
import TablePager from '../harness/TablePager.vue'
import {
  createDemoRows,
  typedColumns,
  useFakeServer,
  type DemoRow
} from '../scenarios'

// Methods on the template ref, for actions that are not state:
// `focusFilter(field)` puts the caret in a column's filter and reports
// whether something took focus (a hidden or unknown column gives `false`);
// `expandAll()` opens the rows on this page only, it never fetches more.
const columns = typedColumns()
const { query, result } = useFakeServer(createDemoRows(), { pageSize: 5 })
const table = ref<QueryTableExpose | null>(null)
const fields = [...columns.map(column => column.field), 'unknown']
const field = ref('name')
const focused = ref<boolean | null>(null)

const focus = () => {
  focused.value = table.value?.focusFilter(field.value) ?? false
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <label class="flex items-center gap-2">
        Field
        <select
          v-model="field"
          class="h-7 rounded-lg border border-input bg-background px-2"
        >
          <option v-for="name in fields" :key="name" :value="name">
            {{ name }}
          </option>
        </select>
      </label>
      <Button variant="outline" size="sm" @click="focus">
        focusFilter('{{ field }}')
      </Button>
      <span class="font-mono text-xs text-muted-foreground">
        returned: {{ focused === null ? '–' : focused }}
      </span>
      <Button variant="outline" size="sm" @click="table?.expandAll()">
        expandAll()
      </Button>
      <Button variant="outline" size="sm" @click="table?.collapseAll()">
        collapseAll()
      </Button>
    </div>
    <QueryTable
      ref="table"
      v-model:query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      row-key="id"
      has-subtable
      filterable
    >
      <template #subtable="{ row }">
        <p class="py-1 pl-6 text-muted-foreground">
          {{ (row as DemoRow).name }} lives in {{ (row as DemoRow).city }}.
        </p>
      </template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
  </div>
</template>
