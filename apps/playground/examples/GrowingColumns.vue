<script setup lang="ts">
import { computed, ref } from 'vue'

import { Button } from '@/ui/button'
import type { Column, ColumnResizePayload } from '@dolusoft/query-table'
import { QueryTable } from '@dolusoft/query-table'

import FilterMenu from '../harness/FilterMenu.vue'
import TablePager from '../harness/TablePager.vue'
import { currentDataset, listColumns, useFakeServer } from '../scenarios'

// With `grow` (C-132) the room of a container wider than the columns goes to
// the growing columns, by their weights, on top of their automatic width;
// the short columns and the expand column keep theirs. The shares are drawn,
// never written back. Drag a growing column: it stays where it is left, and
// the width this page stores is its base. Narrow the box: the shares go
// first, and without room the table scrolls sideways.
const data = currentDataset()
const [primary, secondary] = data.searchFields
const second = ref(false)
const narrow = ref(false)
const saved = ref<Record<string, number>>({})
const columns = computed<Column[]>(() =>
  listColumns(data).map(column => {
    const width = saved.value[column.field]
    const grow =
      column.field === primary
        ? 3
        : second.value && column.field === secondary
          ? 1
          : undefined
    return { ...column, width: width ? `${width}px` : undefined, grow }
  })
)
const onResize = ({ field, width }: ColumnResizePayload) => {
  saved.value = { ...saved.value, [field]: width }
}
const { query, result } = useFakeServer(data.createRows(), { pageSize: 10 })
const idOf = (row: object) => String((row as Record<string, unknown>).id)
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted-foreground">
      <code>{{ primary }}</code> grows with weight 3<template v-if="second"
        >, <code>{{ secondary }}</code> with weight 1</template
      >. Saved widths:
      <code>{{ JSON.stringify(saved) }}</code>
      <Button
        variant="outline"
        size="xs"
        class="ml-2"
        @click="second = !second"
      >
        Second growing column: {{ second ? 'on' : 'off' }}
      </Button>
      <Button
        variant="outline"
        size="xs"
        class="ml-2"
        @click="narrow = !narrow"
      >
        Box: {{ narrow ? '640 px' : 'full width' }}
      </Button>
      <Button variant="outline" size="xs" class="ml-2" @click="saved = {}">
        Reset widths
      </Button>
    </p>
    <!-- Consumer CSS of this page (C-50): with the fixed layout the header
         width is the column width, and the table grows with its columns. -->
    <div
      class="[&_.qt-table]:w-max [&_.qt-table]:min-w-full [&_.qt-table]:table-fixed"
      :style="{ maxWidth: narrow ? '640px' : undefined }"
    >
      <QueryTable
        v-model:query="query"
        :columns="columns"
        :rows="result.rows"
        :total-rows="result.totalRows"
        row-key="id"
        auto-width
        :auto-width-max="240"
        resizable
        sortable
        filterable
        has-subtable
        @column-resize="onResize"
      >
        <template #subtable="{ row }">
          <p class="py-2 pl-6 text-sm text-muted-foreground">
            Details of {{ idOf(row) }}.
          </p>
        </template>
        <template #filter-menu="menu">
          <FilterMenu :menu="menu" />
        </template>
        <template #pagination="page">
          <TablePager :page="page" />
        </template>
      </QueryTable>
    </div>
  </div>
</template>
