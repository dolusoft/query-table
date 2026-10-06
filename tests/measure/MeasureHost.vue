<script setup lang="ts">
import { nextTick, ref, shallowRef } from 'vue'

import type { Column, TableQuery } from '../../packages/vue/src/contract'
import QueryTable from '../../packages/vue/src/index'

// A consumer that behaves like a server-backed page: it owns the query, and
// every `update:query` answers with the rows a server would send (filtered,
// sorted and cut to a page from `dataset`). It takes the time its own render
// needs for each answer (`applied`), forced through layout.
const props = withDefaults(
  defineProps<{
    dataset: Array<Record<string, unknown>>
    columns: Column[]
    initialQuery: TableQuery
    filterDebounce: number
    /** Collects the milliseconds each answer took to patch and lay out. */
    applied: number[]
    /** Reorder handles (the `move` scenario); the others keep them off. */
    reorderable?: boolean
  }>(),
  { reorderable: false }
)

// The consumer owns the layout too (`v-model:columns`).
const layout = shallowRef(props.columns)

// A cell value may be any type; its string form is what the table shows.
// eslint-disable-next-line @typescript-eslint/no-base-to-string
const text = (value: unknown) => String(value ?? '').toLowerCase()

const answer = (query: TableQuery) => {
  let found = props.dataset
  for (const rule of query.filters) {
    found = found.filter(row =>
      text(row[rule.field]).includes(text(rule.value))
    )
  }
  const sort = query.sort
  if (sort) {
    const sign = sort.direction === 'asc' ? 1 : -1
    found = [...found].sort(
      (a, b) =>
        sign *
        text(a[sort.field]).localeCompare(text(b[sort.field]), undefined, {
          numeric: true
        })
    )
  }
  const start = (query.page - 1) * query.pageSize
  return {
    total: found.length,
    rows: found.slice(start, start + query.pageSize)
  }
}

const query = ref(props.initialQuery)
const first = answer(props.initialQuery)
const rows = ref(first.rows)
const total = ref(first.total)
// Flipped by the `.toggle-loading` button (the `loading` scenario).
const loading = ref(false)

const update = (next: TableQuery) => {
  const started = performance.now()
  query.value = next
  const result = answer(next)
  rows.value = result.rows
  total.value = result.total
  void nextTick().then(() => {
    // Reading a layout property forces the style and layout work of the patch.
    void document.body.offsetHeight
    // The host reports into the caller's array on purpose.
    // eslint-disable-next-line vue/no-mutating-props
    props.applied.push(performance.now() - started)
  })
}
</script>

<template>
  <button type="button" class="toggle-loading" @click="loading = !loading">
    Loading
  </button>
  <QueryTable
    v-model:columns="layout"
    :query="query"
    :rows="rows"
    :total-rows="total"
    :loading="loading"
    sortable
    filterable
    :reorderable="reorderable"
    :filter-debounce="filterDebounce"
    @update:query="update"
  >
    <template #pagination="page">
      <span class="page-info"
        >Page {{ page.page }} of {{ page.pageCount }}</span
      >
      <button
        type="button"
        class="next-page"
        :disabled="!page.canNext"
        @click="page.nextPage()"
      >
        Next
      </button>
    </template>
    <template #loading>Loading</template>
  </QueryTable>
</template>
