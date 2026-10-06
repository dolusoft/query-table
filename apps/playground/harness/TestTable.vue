<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import type {
  QueryChangeReason,
  TableProps,
  TableQuery
} from '@dolusoft/query-table'
import QueryTable from '@dolusoft/query-table'

import FilterMenu from './FilterMenu.vue'
import TablePager from './TablePager.vue'
import { setTheme, themeFromUrl, type Theme } from './theme'

// The consumer around the table in the browser tests: it owns the query
// (what `v-model:query` does), takes outside changes through the `query`
// prop, and tells the test about every update through `record`.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  query: TableQuery
  record?: (query: TableQuery, reason: QueryChangeReason) => void
  /** Pins the test skin to a theme; without it the OS decides. */
  theme?: Theme
}>()
const emit = defineEmits<{
  'update:query': [query: TableQuery, reason: QueryChangeReason]
}>()

// The skin reads `data-theme` on <html>. Put back what the page had (the
// `?theme=` parameter, see tests/support/setup.ts) when the harness goes away.
const pageTheme = themeFromUrl()
watch(
  () => props.theme,
  theme => setTheme(theme ?? pageTheme),
  {
    immediate: true
  }
)
onBeforeUnmount(() => setTheme(pageTheme))

const current = ref(props.query)
watch(
  () => props.query,
  query => {
    current.value = query
  }
)

const update = (next: TableQuery, reason: QueryChangeReason) => {
  current.value = next
  emit('update:query', next, reason)
  props.record?.(next, reason)
}
</script>

<template>
  <QueryTable
    v-bind="$attrs as unknown as TableProps"
    :query="current"
    @update:query="update"
  >
    <template #filter-menu="menu">
      <FilterMenu :menu="menu" />
    </template>
    <template #empty>No results.</template>
    <template #loading>Loading…</template>
    <template #pagination="page">
      <TablePager :page="page" />
    </template>
  </QueryTable>
</template>
