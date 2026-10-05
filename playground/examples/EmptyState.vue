<script setup lang="ts">
import { ref } from 'vue'

import { Button } from '@/ui/button'

import { VueServerTable } from '../../src/index'
import TablePager from '../harness/TablePager.vue'
import { makeQuery, peopleColumns } from '../scenarios'

// The `empty` slot shows whenever `rows` is empty, whatever `totalRows` says.
// The table has no loading state: while a request runs, the consumer decides
// what to show (here a line of text instead of the rows).
const columns = peopleColumns()
const query = ref(makeQuery())
const loading = ref(false)
const totalRows = ref<number | null>(0)
const rows: Array<Record<string, unknown>> = []
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" @click="loading = !loading">
        {{ loading ? 'Stop loading' : 'Pretend to load' }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        @click="totalRows = totalRows === 0 ? 120 : 0"
      >
        totalRows: {{ totalRows }}
      </Button>
    </div>
    <VueServerTable
      v-model:query="query"
      :columns="columns"
      :rows="rows"
      :total-rows="totalRows"
    >
      <template #empty>
        <span v-if="loading">Loading…</span>
        <span v-else>No people yet.</span>
      </template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </VueServerTable>
  </div>
</template>
