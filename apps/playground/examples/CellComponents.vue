<script setup lang="ts">
import {
  CellAction,
  CellActions,
  CellBadge,
  CellCopy,
  CellPreview,
  CellStack,
  CellValue,
  type CellBadgeTone
} from '@dolusoft/query-table/cells'
import { DataTable } from '@dolusoft/query-table/data-table'
import { computed, ref } from 'vue'

import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import type { Column, TableLabels } from '@dolusoft/query-table'

// The cell components of `/cells` (ADR 0022) in the cell slots of a
// `DataTable`: two lines, a value to copy, a text to preview, a status, an
// empty value and the row's actions. They draw only their own markup with
// `qt-cell-*` hooks; this page's skin dresses them. Copying and previewing
// are the page's: the components only emit (C-129). Their button names and
// the empty-value text come from the table's `labels`, so switching the
// labels to Turkish renames them with the table.

interface Site {
  id: number
  name: string
  note: string
  mappingId: string
  template: string
  status: string
  tone: CellBadgeTone
  apiVariable: string | null
}

const sites: Site[] = [
  {
    id: 1,
    name: 'AnaOfis',
    note: 'test',
    mappingId: 'eeba5a76-4a03-4fba-a6a5-04c94545e06c',
    template: 'Default Template',
    status: 'Active',
    tone: 'success',
    apiVariable: null
  },
  {
    id: 2,
    name: 'seed-hotspot-template-mapping-0',
    note: 'Seeded template mapping for e2e coverage',
    mappingId: 'def8d6fc-fb38-4271-b2b6-f37709b7c039',
    template: 'seed-hotspot-template-1',
    status: 'Pending',
    tone: 'info',
    apiVariable: 'seed-volume-api-variable-146'
  },
  {
    id: 3,
    name: 'seed-hotspot-template-mapping-1',
    note: 'Mapping for the branch office device',
    mappingId: '352280b9-2f43-4a91-9656-63adcd8ab860',
    template: 'seed-hotspot-template-0',
    status: 'Unsupported',
    tone: 'warning',
    apiVariable: null
  },
  {
    id: 4,
    name: '60E',
    note: '',
    mappingId: '00bcd6a7-9fac-4532-9927-cd3c4d6b6871',
    template: 'Default Template',
    status: 'Offline',
    tone: 'danger',
    apiVariable: ''
  }
]

const columns: Column[] = [
  { field: 'id', type: 'integer', hide: true },
  { field: 'name', title: 'Name' },
  { field: 'mappingId', title: 'Mapping ID' },
  { field: 'template', title: 'Template' },
  { field: 'status', title: 'Status' },
  { field: 'apiVariable', title: 'API variable' },
  { field: 'actions', title: 'Actions', sortable: false }
]

const turkish = ref(false)
const labels = computed<Partial<TableLabels>>(() =>
  turkish.value
    ? {
        copyValue: value => `${value} kopyala`,
        previewValue: text => `${text} önizle`,
        emptyValue: '—'
      }
    : {}
)

const last = ref('none yet')
const copy = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
    last.value = `copied ${value}`
  } catch {
    last.value = `copy asked for ${value} (the clipboard said no)`
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <Label class="font-normal">
        <Checkbox v-model="turkish" />
        Turkish labels
      </Label>
      <span class="text-muted-foreground" role="status"
        >Last action: {{ last }}</span
      >
    </div>
    <DataTable
      :columns="columns"
      :rows="sites"
      row-key="id"
      :labels="labels"
      sortable
    >
      <template #cell-name="{ row }">
        <CellStack :primary="row.name" :secondary="row.note" />
      </template>
      <template #cell-mappingId="{ row }">
        <CellCopy :value="row.mappingId" @copy="copy" />
      </template>
      <template #cell-template="{ row }">
        <CellPreview
          :text="row.template"
          @preview="text => (last = `preview ${text}`)"
        />
      </template>
      <template #cell-status="{ row }">
        <CellBadge :tone="row.tone" :text="row.status" />
      </template>
      <template #cell-apiVariable="{ row }">
        <CellValue :value="row.apiVariable" />
      </template>
      <template #cell-actions="{ row }">
        <CellActions>
          <CellAction
            kind="primary"
            :aria-label="`Edit ${row.name}`"
            @click="last = `edit ${row.name}`"
            >Edit</CellAction
          >
          <CellAction
            kind="danger"
            :aria-label="`Delete ${row.name}`"
            @click="last = `delete ${row.name}`"
            >Delete</CellAction
          >
        </CellActions>
      </template>
    </DataTable>
  </div>
</template>
