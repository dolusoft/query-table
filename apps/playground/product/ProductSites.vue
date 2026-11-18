<script setup lang="ts">
import { DataTable } from '@dolusoft/query-table/data-table'
import { computed, ref } from 'vue'

import type {
  Column,
  PaginationSlotProps,
  RowSelection,
  TableLabels
} from '@dolusoft/query-table'

// The sites list of the product, drawn with `DataTable` and the product skin
// (skin.css). The cell content (two lines, chips, the badge, the dash and the
// action buttons) is slot markup styled by demo.css until the cell
// components of ADR 0022 give it hooks of its own.

interface Site {
  id: number
  name: string
  note: string
  provider: string
  vendor: string
  unsupported: boolean
  mappingId: string
  template: string
  deviceSetup: string | null
  apiVariable: string | null
}

const sites: Site[] = [
  {
    id: 1,
    name: 'AnaOfis',
    note: 'test',
    provider: 'FGT60FTK2209DELV',
    vendor: 'FortiGate',
    unsupported: false,
    mappingId: 'eeba5a76-4a03-4fba-a6a5-04c94545e06c',
    template: 'Default Template',
    deviceSetup: null,
    apiVariable: null
  },
  {
    id: 2,
    name: 'seed-hotspot-template-mapping-0',
    note: 'Seeded template mapping for e2e coverage',
    provider: 'seed-hotspot-site-0',
    vendor: 'FortiGate',
    unsupported: false,
    mappingId: 'def8d6fc-fb38-4271-b2b6-f37709b7c039',
    template: 'seed-hotspot-template-1',
    deviceSetup: null,
    apiVariable: null
  },
  {
    id: 3,
    name: 'AnaOfis',
    note: 'test',
    provider: 'X10125QCHVYR44F',
    vendor: 'Sophos',
    unsupported: false,
    mappingId: 'adead891-42ae-4b6a-a1b5-be32087c95c7',
    template: 'Default Template',
    deviceSetup: null,
    apiVariable: 'seed-volume-api-variable-146'
  },
  {
    id: 4,
    name: 'audit56-d2',
    note: '#56 D2 testi - gecici, silinecek',
    provider: 'audit56-d2-site',
    vendor: 'FortiGate',
    unsupported: false,
    mappingId: '939591c0-dbfd-458b-974f-9452d2777b00',
    template: 'seed-hotspot-template-2',
    deviceSetup: null,
    apiVariable: null
  },
  {
    id: 5,
    name: 'seed-hotspot-template-mapping-1',
    note: 'Mapping for the branch office device',
    provider: 'seed-hotspot-site-1',
    vendor: 'SonicWall',
    unsupported: true,
    mappingId: '352280b9-2f43-4a91-9656-63adcd8ab860',
    template: 'seed-hotspot-template-0',
    deviceSetup: null,
    apiVariable: null
  },
  {
    id: 6,
    name: '60E',
    note: '60E',
    provider: 'FGT60E4Q16043370',
    vendor: 'FortiGate',
    unsupported: false,
    mappingId: '00bcd6a7-9fac-4532-9927-cd3c4d6b6871',
    template: 'Default Template',
    deviceSetup: null,
    apiVariable: null
  }
]

// `?rows=5000` repeats the sites up to that many rows, to see how the skin
// and `DataTable` hold up with a large list held in the page.
const asked = Number(new URLSearchParams(location.search).get('rows'))
const rows: Site[] =
  Number.isSafeInteger(asked) && asked > sites.length
    ? Array.from({ length: asked }, (_, index) => {
        const site = sites[index % sites.length]
        return {
          ...site,
          id: index + 1,
          name: `${site.name}-${index + 1}`,
          mappingId: `${site.mappingId.slice(0, 28)}${String(index).padStart(8, '0')}`
        }
      })
    : sites

const columns: Column[] = [
  { field: 'id', type: 'integer', hide: true },
  { field: 'name', title: 'Ad' },
  { field: 'provider', title: 'Sağlayıcı' },
  { field: 'mappingId', title: 'Eşleşim Kimliği' },
  { field: 'template', title: 'Şablon' },
  { field: 'deviceSetup', title: 'Cihaz kurulumu', sortable: false },
  { field: 'apiVariable', title: 'API Değişkeni' },
  { field: 'actions', title: 'İşlemler', sortable: false }
]

const labels: Partial<TableLabels> = {
  expandRow: 'Satırı aç',
  selectRow: 'Satırı seç',
  selectAllRows: 'Tüm satırları seç',
  clearAllFilters: 'Tüm filtreleri temizle'
}

const selection = ref<RowSelection>({})
const selected = computed(
  () => Object.values(selection.value).filter(Boolean).length
)

type Theme = 'dark' | 'light' | 'system'
const theme = ref<Theme>('dark')
const setTheme = (next: Theme) => {
  theme.value = next
  if (next === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', next)
  }
}
setTheme('dark')

// Copying is the consumer's (ADR 0022, K320-4): the table only asks.
const copied = ref<string | null>(null)
const copy = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = value
  } catch {
    copied.value = null
  }
}

const range = (page: PaginationSlotProps) => {
  const total = page.totalRows ?? 0
  if (total === 0) {
    return '0 satır'
  }
  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.page * page.pageSize, total)
  return `${total} satırdan ${first} - ${last}`
}
// The first and the last page, the current one and its neighbours; a gap
// between them is one `…`. A pager button per page would draw thousands.
const pages = (page: PaginationSlotProps): Array<number | '…'> => {
  const count = page.pageCount ?? 1
  const shown = [
    ...new Set([1, page.page - 1, page.page, page.page + 1, count])
  ]
    .filter(number => number >= 1 && number <= count)
    .sort((a, b) => a - b)
  return shown.flatMap((number, index) =>
    index > 0 && number - shown[index - 1] > 1
      ? (['…', number] as const)
      : [number]
  )
}
</script>

<template>
  <main class="page">
    <div class="theme-switch" role="group" aria-label="Tema">
      <button
        v-for="option in ['dark', 'light', 'system'] as const"
        :key="option"
        type="button"
        :aria-pressed="theme === option"
        @click="setTheme(option)"
      >
        {{ { dark: 'Koyu', light: 'Açık', system: 'Sistem' }[option] }}
      </button>
    </div>

    <DataTable
      v-model:selection="selection"
      class="sites"
      :columns="columns"
      :rows="rows"
      row-key="id"
      :labels="labels"
      :pagination="{ pageSizeOptions: [10, 25, 50] }"
      sortable
      has-subtable
      expand-mode="single"
    >
      <template #toolbar>
        <div class="toolbar">
          <span class="toolbar-title"
            >Kayıtlar <span class="count">{{ rows.length }}</span></span
          >
          <span class="toolbar-actions">
            <button type="button" class="button" :disabled="selected === 0">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 4h10M6 4V2.5h4V4M4.5 4l.5 9.5h6l.5-9.5" />
              </svg>
              Sil <span class="divider" /><span class="count">{{
                selected
              }}</span>
            </button>
            <button type="button" class="button button-primary">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 3v10M3 8h10" />
              </svg>
              Site Ekle
            </button>
          </span>
        </div>
      </template>

      <template #cell-name="{ row }">
        <span class="stack">
          <strong>{{ row.name }}</strong>
          <small>{{ row.note }}</small>
        </span>
      </template>

      <template #cell-provider="{ row }">
        <span class="stack">
          <strong>{{ row.provider }}</strong>
          <small
            >{{ row.vendor }}
            <span v-if="row.unsupported" class="badge" data-tone="warning"
              >Desteklenmiyor</span
            ></small
          >
        </span>
      </template>

      <template #cell-mappingId="{ row }">
        <span class="chip">
          <code>{{ row.mappingId }}</code>
          <button
            type="button"
            :aria-label="`${row.mappingId} kopyala`"
            @click="copy(row.mappingId)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="5" y="5" width="8" height="8" rx="1.5" />
              <path d="M3.5 10.5V4a.5.5 0 0 1 .5-.5h6.5" />
            </svg>
          </button>
        </span>
      </template>

      <template #cell-template="{ row }">
        <span class="chip">
          <span>{{ row.template }}</span>
          <button type="button" :aria-label="`${row.template} önizle`">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"
              />
              <circle cx="8" cy="8" r="1.75" />
            </svg>
          </button>
        </span>
      </template>

      <template #cell-deviceSetup="{ row }">{{
        row.deviceSetup ?? '-'
      }}</template>
      <template #cell-apiVariable="{ row }">{{
        row.apiVariable ?? '-'
      }}</template>

      <template #cell-actions>
        <span class="actions">
          <button type="button" class="button button-edit">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M9.5 3.5h-6v9h9v-6M7 9l.5-2 5-5 1.5 1.5-5 5L7 9Z" />
            </svg>
            Düzenle
          </button>
          <button type="button" class="button button-danger">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 4h10M6 4V2.5h4V4M4.5 4l.5 9.5h6l.5-9.5" />
            </svg>
            Sil
          </button>
        </span>
      </template>

      <template #subtable="{ row }">
        <dl class="details">
          <div>
            <dt>Eşleşim Kimliği</dt>
            <dd>{{ row.mappingId }}</dd>
          </div>
          <div>
            <dt>Şablon</dt>
            <dd>{{ row.template }}</dd>
          </div>
          <div>
            <dt>Sağlayıcı</dt>
            <dd>{{ row.provider }} ({{ row.vendor }})</dd>
          </div>
        </dl>
      </template>

      <template #empty>Kayıt yok.</template>

      <template #pagination="page">
        <span class="pager-size">
          <label for="page-size">Sayfa başına</label>
          <select
            id="page-size"
            :value="page.pageSize"
            @change="
              page.setPageSize(
                Number(($event.target as HTMLSelectElement).value)
              )
            "
          >
            <option
              v-for="size in page.pageSizeOptions"
              :key="size"
              :value="size"
            >
              {{ size }}
            </option>
          </select>
          <span>{{ range(page) }}</span>
        </span>
        <span class="pager-pages">
          <button
            type="button"
            class="button button-icon"
            aria-label="Önceki sayfa"
            :disabled="!page.canPrevious"
            @click="page.previousPage()"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3.5 5.5 8l4.5 4.5" />
            </svg>
          </button>
          <template v-for="(number, index) in pages(page)" :key="index">
            <span v-if="number === '…'" class="gap" aria-hidden="true">…</span>
            <button
              v-else
              type="button"
              class="button button-icon"
              :aria-label="`Sayfa ${number}`"
              :aria-current="number === page.page ? 'page' : undefined"
              @click="page.setPage(number)"
            >
              {{ number }}
            </button>
          </template>
          <button
            type="button"
            class="button button-icon"
            aria-label="Sonraki sayfa"
            :disabled="!page.canNext"
            @click="page.nextPage()"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
        </span>
      </template>
    </DataTable>

    <p class="status" role="status">
      {{ copied ? `Kopyalandı: ${copied}` : '' }}
    </p>
  </main>
</template>
