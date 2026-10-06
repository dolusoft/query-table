<script setup lang="ts">
import { computed, ref } from 'vue'

import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { QueryTable } from '@dolusoft/query-table'

import TablePager from '../harness/TablePager.vue'
import { createDemoRows, peopleColumns, useFakeServer } from '../scenarios'

// Paging is always on; the controls are the consumer's, in the `pagination`
// slot. With the total unknown (`totalRows: null`) there is no page count,
// and "Next" stays enabled while a full page comes back.
const columns = peopleColumns()
const { query, result } = useFakeServer(createDemoRows(), { pageSize: 20 })
const totalKnown = ref(true)
const totalRows = computed(() =>
  totalKnown.value ? result.value.totalRows : null
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <Label class="font-normal">
      <Checkbox v-model="totalKnown" />
      The server reports the total
    </Label>
    <QueryTable
      v-model:query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="totalRows"
      :pagination="{ pageSizeOptions: [10, 20, 50, 100] }"
      row-key="id"
    >
      <template #pagination="page">
        <TablePager :page="page" />
        <p class="pt-2 text-xs text-muted-foreground">
          totalRows: {{ page.totalRows ?? 'unknown' }} · pageCount:
          {{ page.pageCount ?? 'unknown' }}
        </p>
      </template>
    </QueryTable>
  </div>
</template>
