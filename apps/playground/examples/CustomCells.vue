<script setup lang="ts">
import { ref } from 'vue'

import { Badge } from '@/ui/badge'
import { Checkbox } from '@/ui/checkbox'
import type { CellContextMenuPayload, Column } from '@dolusoft/query-table'
import { QueryTable } from '@dolusoft/query-table'

import TablePager from '../harness/TablePager.vue'
import {
  columnOf,
  currentDataset,
  listColumns,
  useFakeServer,
  type DemoRow
} from '../scenarios'

// `cell-<field>` slots draw the cells of one column with your markup: a
// checkbox, a link, a badge. The table cancels no click, so they keep their
// default action. A right click on a cell emits `cellContextMenu`; the
// right-panel button of a row emits `rowRightPanelClick`.
const data = currentDataset()
const { primary, flag } = data.fields
const columns: Column[] = [
  { field: 'pick', title: '', width: '40px', filterable: false },
  ...listColumns(data),
  columnOf(data, flag)
]
const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })
const picked = ref<number[]>([])
const togglePick = (id: number, on: boolean) => {
  picked.value = on
    ? [...picked.value, id]
    : picked.value.filter(value => value !== id)
}
const lastEvent = ref('Right-click a cell or press a row panel button.')

const onContextMenu = (payload: CellContextMenuPayload<DemoRow>) => {
  lastEvent.value = `cellContextMenu: row ${payload.row.id}, column "${payload.column.field}", value ${JSON.stringify(payload.cellValue)}`
}
const onRightPanel = (row: DemoRow) => {
  lastEvent.value = `rowRightPanelClick: row ${row.id} (${String(row[primary])})`
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted-foreground">
      Picked: {{ picked.length ? picked.join(', ') : 'none' }} ·
      {{ lastEvent }}
    </p>
    <QueryTable
      v-model:query="query"
      :columns="columns"
      :rows="result.rows"
      :total-rows="result.totalRows"
      row-key="id"
      has-right-panel
      @cell-context-menu="onContextMenu"
      @row-right-panel-click="onRightPanel"
    >
      <template #cell-pick="{ row }">
        <Checkbox
          :model-value="picked.includes((row as DemoRow).id)"
          :aria-label="`Pick row ${(row as DemoRow).id}`"
          @update:model-value="togglePick((row as DemoRow).id, $event === true)"
        />
      </template>
      <template #[`cell-${primary}`]="{ row, cellValue }">
        <a
          class="text-primary underline-offset-4 hover:underline"
          :href="`#${data.noun.one}-${(row as DemoRow).id}`"
          @click.prevent
          >{{ cellValue }}</a
        >
      </template>
      <template #[`cell-${flag}`]="{ cellValue }">
        <Badge :variant="cellValue ? 'secondary' : 'outline'">{{
          cellValue ? data.flagLabels.on : data.flagLabels.off
        }}</Badge>
      </template>
      <template #pagination="page">
        <TablePager :page="page" />
      </template>
    </QueryTable>
  </div>
</template>
