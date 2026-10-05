import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import VueServerTable from '../src/components/index'
import type { ColumnDefinition } from '../src/model/column-model'

export const makeColumns = (): ColumnDefinition[] => [
  { field: 'id', title: 'ID', type: 'number' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'number' },
  { field: 'joined', title: 'Joined', type: 'date' }
]

export const makeRows = () => [
  { id: 1, name: 'Charlie', age: 30, joined: '2024-01-10' },
  { id: 2, name: 'alice', age: 25, joined: '2024-02-15' },
  { id: 3, name: 'Bob', age: 40, joined: '2024-03-20' },
  { id: 4, name: 'Dave', age: 25, joined: '2024-04-25' },
  { id: 5, name: 'Eve', age: 35, joined: '2024-05-30' }
]

// The footer slots the consumer provides: a page-size select fed by
// `setPageSize` and previous/next buttons fed by `previousPage`/`nextPage`.
export const footerSlots = {
  footerpageinfo: `
    <select
      v-if="params.showPageSize"
      class="bh-pagesize"
      :value="params.currentPageSize"
      @change="params.setPageSize(Number($event.target.value))"
    >
      <option v-for="o in params.pageSizeOptions" :key="o" :value="o">{{ o }}</option>
    </select>`,
  footerpagination: `
    <span class="page-state">{{ params.currentPage }}/{{ params.maxPage }}</span>
    <button type="button" class="previous-page" @click="params.previousPage()">prev</button>
    <button type="button" class="next-page" @click="params.nextPage()">next</button>`
}

export const mountTable = (
  props: Record<string, any> = {},
  options: Record<string, any> = {}
) =>
  mount(VueServerTable as any, {
    props: { columns: makeColumns(), rows: makeRows(), totalRows: 5, ...props },
    attachTo: document.body,
    ...options,
    slots: { ...footerSlots, ...(options.slots ?? {}) }
  })

export const flush = async () => {
  await nextTick()
  await nextTick()
}

export const changeEvents = (wrapper: any): any[] =>
  (wrapper.emitted('change') || []).map((args: any[]) => args[0])
