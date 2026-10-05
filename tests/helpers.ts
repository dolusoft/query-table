import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, type Component } from 'vue'

import VueServerTable from '../src/components/index'
import type { Column, QueryChangeReason, TableQuery } from '../src/contract'

export interface Row {
  id: number
  name: string
  age: number
  joined: string
}

export const makeColumns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'number' },
  { field: 'joined', title: 'Joined', type: 'date' }
]

export const makeRows = (): Row[] => [
  { id: 1, name: 'Charlie', age: 30, joined: '2024-01-10' },
  { id: 2, name: 'alice', age: 25, joined: '2024-02-15' },
  { id: 3, name: 'Bob', age: 40, joined: '2024-03-20' },
  { id: 4, name: 'Dave', age: 25, joined: '2024-04-25' },
  { id: 5, name: 'Eve', age: 35, joined: '2024-05-30' }
]

export const makeQuery = (overrides: Partial<TableQuery> = {}): TableQuery => ({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: [],
  ...overrides
})

/** Freezes an object and everything inside it, so a write throws. */
export const deepFreeze = <V>(value: V): V => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

// The paging controls a consumer would put in the `pagination` slot: a page
// size select and previous/next buttons fed by the slot props.
const paginationSlot = `
  <select
    class="page-size"
    :value="params.pageSize"
    @change="params.setPageSize(Number($event.target.value))"
  >
    <option v-for="o in params.pageSizeOptions" :key="o" :value="o">{{ o }}</option>
  </select>
  <span class="page-state">{{ params.page }}/{{ params.pageCount }}</span>
  <button type="button" class="previous-page" @click="params.previousPage()">prev</button>
  <button type="button" class="next-page" @click="params.nextPage()">next</button>`

export type UpdateEvent = [TableQuery, QueryChangeReason]

export interface Mounted {
  wrapper: VueWrapper
  /** Every `update:query` the table emitted, in order. */
  events: UpdateEvent[]
  /** The query last passed to the table. */
  query: () => TableQuery
  /** What a consumer does from outside: replace the query. */
  setQuery: (query: TableQuery) => Promise<void>
}

export interface MountOptions {
  slots?: Record<string, unknown>
  /** Apply every emitted query (the `v-model` behavior). Default `true`. */
  apply?: boolean
}

export const mountTable = (
  props: Record<string, unknown> = {},
  options: MountOptions = {}
): Mounted => {
  const events: UpdateEvent[] = []
  const apply = options.apply ?? true
  // An `undefined` entry removes a default slot.
  const slots = Object.fromEntries(
    Object.entries({ pagination: paginationSlot, ...options.slots }).filter(
      ([, slot]) => slot !== undefined
    )
  )
  // eslint-disable-next-line prefer-const
  let wrapper: VueWrapper
  wrapper = mount(VueServerTable as unknown as Component, {
    props: {
      columns: makeColumns(),
      rows: makeRows(),
      totalRows: 5,
      query: makeQuery(),
      'onUpdate:query': (query: TableQuery, reason: QueryChangeReason) => {
        events.push([query, reason])
        if (apply) {
          void wrapper.setProps({ query })
        }
      },
      ...props
    },
    attachTo: document.body,
    slots: slots as never
  })
  return {
    wrapper,
    events,
    query: () => (wrapper.props() as { query: TableQuery }).query,
    setQuery: query => wrapper.setProps({ query })
  }
}

/** The props the table currently has. */
export const propsOf = (m: Mounted) =>
  m.wrapper.props() as { rows: object[]; columns: Column[]; query: TableQuery }

export const flush = async () => {
  await nextTick()
  await nextTick()
}

export const reasons = (events: UpdateEvent[]) => events.map(([, r]) => r)
