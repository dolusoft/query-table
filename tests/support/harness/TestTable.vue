<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { Button } from '@/ui/button'

import FilterMenu from './FilterMenu.vue'
import type {
  QueryChangeReason,
  TableProps,
  TableQuery
} from '../../../src/contract'
import VueServerTable from '../../../src/index'
import { setTheme, themeFromUrl, type Theme } from '../theme'

// The consumer around the table: it owns the query (what `v-model:query`
// does), takes outside changes through the `query` prop, and tells the test
// about every update through `record`.
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
// `?theme=` parameter, see setup.ts) when the harness goes away.
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
  <VueServerTable
    v-bind="$attrs as unknown as TableProps"
    :query="current"
    @update:query="update"
  >
    <template #filter-menu="menu">
      <FilterMenu :menu="menu" />
    </template>
    <template #empty>No results.</template>
    <!-- shadcn data-table pagination: muted text left, controls right -->
    <template #pagination="page">
      <div class="flex items-center justify-between gap-4">
        <span class="page-info text-sm text-muted-foreground"
          >Page {{ page.page }} of {{ page.pageCount ?? '?' }}</span
        >
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium">Rows per page</span>
          <!-- Chromium's native popup needs an opaque select background:
               a translucent input surface can leave its list white. -->
          <select
            aria-label="Rows per page"
            class="page-size h-7 rounded-lg border border-input bg-background px-2 text-[0.8rem] text-foreground tabular-nums transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            :value="page.pageSize"
            @change="
              page.setPageSize(
                Number(($event.target as HTMLSelectElement).value)
              )
            "
          >
            <option
              v-for="n in page.pageSizeOptions"
              :key="n"
              :value="n"
              class="bg-popover text-popover-foreground"
            >
              {{ n }}
            </option>
          </select>
          <Button
            variant="outline"
            size="sm"
            class="previous-page"
            :disabled="!page.canPrevious"
            @click="page.previousPage()"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="next-page"
            :disabled="!page.canNext"
            @click="page.nextPage()"
          >
            Next
          </Button>
        </div>
      </div>
    </template>
  </VueServerTable>
</template>
