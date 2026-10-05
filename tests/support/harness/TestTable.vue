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
    <template #pagination="page">
      <div class="flex items-center justify-between">
        <span class="page-info"
          >Page {{ page.page }} of {{ page.pageCount ?? '?' }}</span
        >
        <div class="flex items-center gap-2">
          <select
            class="page-size h-7 rounded-lg border border-input bg-transparent px-2 text-[0.8rem]"
            :value="page.pageSize"
            @change="
              page.setPageSize(
                Number(($event.target as HTMLSelectElement).value)
              )
            "
          >
            <option v-for="n in page.pageSizeOptions" :key="n" :value="n">
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
