<script setup lang="ts">
import { ArrowDownToLineIcon, ArrowUpToLineIcon, PinOffIcon } from '@lucide/vue'
import { computed, nextTick, ref, shallowRef } from 'vue'

import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import {
  QueryTable,
  type CellSlotProps,
  type RowPinning
} from '@dolusoft/query-table'

import TablePager from '../harness/TablePager.vue'
import {
  currentDataset,
  listColumns,
  useFakeServer,
  type DemoRow
} from '../scenarios'

// The page owns the pinned rows: a map of row keys (`row-key` as a string)
// pinned to the top or the bottom. The buttons in the primary cell call the
// slot's `pinRow`; the table emits a new map with `update:rowPinning` and
// draws nothing new until the page writes it back. `v-model:row-pinning`
// does that. The keys stay when the page changes: a pinned row of another
// page is not drawn here, and comes back on top when its page does.
//
// "On every page" is the page's recipe, not the table's: it adds the pinned
// rows it knows to `rows` itself, once per key. A real page fetches them by
// key; this one reads them from its own demo data. With an unknown total
// such rows would count for the next page button (C-23).
// Moving a row can blur its button in the browser. Keep the user's focus
// on the same control after Vue has applied the consumer's new map.
const pinFromButton = async (
  event: MouseEvent,
  pinRow: CellSlotProps<DemoRow>['pinRow'],
  position: 'top' | 'bottom'
) => {
  const button = event.currentTarget as HTMLButtonElement
  const hadFocus = document.activeElement === button
  pinRow(position)
  await nextTick()
  if (hadFocus && button.isConnected) {
    button.focus()
  }
}

const data = currentDataset()
const primary = data.fields.primary
const allRows = data.createRows()
const columns = listColumns(data)
const { query, result } = useFakeServer(allRows, { pageSize: 10 })
const pinning = shallowRef<RowPinning>({ top: [], bottom: [] })
const everyPage = ref(false)

const byKey = new Map(allRows.map(row => [String(row.id), row]))

const rows = computed<DemoRow[]>(() => {
  const page = result.value.rows
  if (!everyPage.value) {
    return page
  }
  const shown = new Set(page.map(row => String(row.id)))
  const missing = [...pinning.value.top, ...pinning.value.bottom]
    .filter(key => !shown.has(key))
    .map(key => byKey.get(key))
    .filter((row): row is DemoRow => row !== undefined)
  return [...missing, ...page]
})

const pinnedText = computed(() => {
  const { top, bottom } = pinning.value
  const list = (keys: string[]) => (keys.length ? keys.join(', ') : 'none')
  return `Top: ${list(top)} · Bottom: ${list(bottom)}`
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Label class="font-normal text-muted-foreground">
        <Checkbox
          :model-value="everyPage"
          @update:model-value="on => (everyPage = on === true)"
        />
        Show pinned rows on every page
      </Label>
      <p class="text-sm text-muted-foreground">
        Pinned keys (kept across pages): {{ pinnedText }}
      </p>
    </div>
    <QueryTable
      v-model:query="query"
      v-model:row-pinning="pinning"
      :columns="columns"
      :rows="rows"
      :total-rows="result.totalRows"
      row-key="id"
      sortable
    >
      <template #[`cell-${primary}`]="{ row, rowPinned, pinRow }">
        <span class="inline-flex items-center gap-1">
          {{ (row as DemoRow)[primary] }}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Pin to top"
            title="Pin to top"
            :aria-pressed="rowPinned === 'top'"
            @click="pinFromButton($event, pinRow, 'top')"
          >
            <ArrowUpToLineIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Pin to bottom"
            title="Pin to bottom"
            :aria-pressed="rowPinned === 'bottom'"
            @click="pinFromButton($event, pinRow, 'bottom')"
          >
            <ArrowDownToLineIcon />
          </Button>
          <Button
            v-if="rowPinned"
            variant="ghost"
            size="icon-xs"
            aria-label="Unpin"
            title="Unpin"
            @click="pinRow(false)"
          >
            <PinOffIcon />
          </Button>
        </span>
      </template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
  </div>
</template>
