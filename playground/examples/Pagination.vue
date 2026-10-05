<script setup lang="ts">
import { computed, ref } from 'vue'

import { VueServerTable } from '../../src/index'
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
    <label class="flex items-center gap-2 text-sm">
      <input v-model="totalKnown" type="checkbox" />
      The server reports the total
    </label>
    <VueServerTable
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
    </VueServerTable>
  </div>
</template>
