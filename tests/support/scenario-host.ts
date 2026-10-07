import { expect } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'

import QueryTable, {
  type Column,
  type PaginationSlotProps,
  type Query,
  type QueryChangeReason,
  type RowSelection,
  type SubtableSlotProps,
  type TableQuery,
  type ToolbarSlotProps
} from '@dolusoft/query-table'

import { columns as defaultColumns, makeQuery, sleep } from './fixtures'
import { createPeople, peopleSearchFields } from './people'
import { traceUpdate } from './trace'
import FilterMenu from '../../apps/playground/harness/FilterMenu.vue'
import TablePager from '../../apps/playground/harness/TablePager.vue'
import {
  cursorDemoPage,
  queryDemoRows,
  searchDemoRows
} from '../../apps/playground/scenarios/fake-server'

// The consumer of the scenario specs (tests/scenarios): a page that owns the
// query, the selection and the column layout, asks a fake server for every
// query the table emits and draws the answer. It records each `update:query`
// (reason and query, in order) and each `update:selection`, so a scenario
// can check after every step both what the table shows and what it said.
//
// With `deferred`, a request leaves `loading` on until the test answers it
// with `respond()`; the answer can be the rows or a server error, which the
// page shows in the `empty` slot (the table has no error state of its own).

export interface ScenarioUpdate {
  reason: QueryChangeReason
  query: Query
}

export interface ScenarioOptions {
  initial?: Query
  /** Every row the server holds; default the 200 people of `people.ts`. */
  allRows?: Array<{ id: number } & Record<string, unknown>>
  columns?: Column[]
  searchFields?: readonly string[]
  /** Draw the selection column (`v-model:selection`). */
  selection?: boolean
  /** Draw the expand buttons and a subtable per row. */
  subtable?: boolean
  /** Draw the right panel buttons. */
  rightPanel?: boolean
  /** Leave `loading` on until `respond()`. */
  deferred?: boolean
  searchDebounce?: number
  pageSizeOptions?: number[]
  /** Extra table props (`reorderable`, `resizable`, ...). */
  props?: Record<string, unknown>
}

type Answer =
  { kind: 'rows' } | { kind: 'error'; message: string } | { kind: 'empty' }

export const renderScenario = async (options: ScenarioOptions = {}) => {
  const allRows = options.allRows ?? createPeople()
  const searchFields = options.searchFields ?? peopleSearchFields
  const tableColumns = options.columns ?? defaultColumns()
  const query = ref<Query>(options.initial ?? makeQuery())
  const selection = ref<RowSelection>({})
  const answerFor = (asked: Query) => {
    if ('cursor' in asked) {
      return {
        ...cursorDemoPage(allRows, asked, searchFields),
        totalRows: null
      }
    }
    return {
      ...queryDemoRows(
        searchDemoRows(allRows, asked.search, searchFields),
        asked
      ),
      cursors: { next: null, prev: null }
    }
  }
  const answer = shallowRef(answerFor(query.value))
  const error = ref<string | null>(null)
  const loading = ref(false)
  const updates: ScenarioUpdate[] = []
  const selections: RowSelection[] = []
  const requests: Query[] = []

  const request = () => {
    requests.push(JSON.parse(JSON.stringify(query.value)) as Query)
    if (options.deferred) {
      loading.value = true
    } else {
      answer.value = answerFor(query.value)
    }
  }
  /** Answers the latest request (stale answers are the consumer's policy). */
  const respond = async (reply: Answer = { kind: 'rows' }) => {
    const asked = requests[requests.length - 1]
    if (reply.kind === 'error') {
      error.value = reply.message
      answer.value = {
        rows: [],
        totalRows: 0,
        cursors: { next: null, prev: null }
      }
    } else if (reply.kind === 'empty') {
      error.value = null
      answer.value = {
        rows: [],
        totalRows: 0,
        cursors: { next: null, prev: null }
      }
    } else {
      error.value = null
      answer.value = answerFor(asked)
    }
    loading.value = false
    await nextTick()
  }
  const onQuery = (next: Query, reason: QueryChangeReason) => {
    traceUpdate(next as TableQuery, reason)
    updates.push({
      reason,
      query: JSON.parse(JSON.stringify(next)) as Query
    })
    query.value = next
    request()
  }
  // The first fetch is the page's own request, never an update of the table.
  request()
  if (options.deferred) {
    await respond()
  }

  // Slot functions with their own prop types; `h` takes them as they are.
  const slots: Record<string, (props: never) => unknown> = {
    toolbar: (bar: ToolbarSlotProps) =>
      h('div', { class: 'scenario-toolbar' }, [
        h('input', {
          type: 'search',
          'aria-label': 'Search',
          value: bar.search,
          onInput: (event: Event) =>
            bar.setSearch((event.target as HTMLInputElement).value),
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
              bar.applySearch()
            }
          }
        }),
        h(
          'button',
          { type: 'button', class: 'scenario-retry', onClick: request },
          'Reload'
        )
      ]),
    'filter-menu': (menu: InstanceType<typeof FilterMenu>['$props']['menu']) =>
      h(FilterMenu, { menu }),
    pagination: (pager: PaginationSlotProps) =>
      h('div', [
        h(TablePager, { page: pager }),
        h('output', { class: 'scenario-total' }, String(pager.totalRows))
      ]),
    empty: () =>
      error.value
        ? h('p', { role: 'alert', class: 'scenario-error' }, error.value)
        : 'No results.',
    loading: () => 'Loading…'
  }
  if (options.subtable) {
    slots.subtable = (detail: SubtableSlotProps<{ id: number }>) =>
      h('p', { class: 'scenario-detail' }, `Detail of ${detail.row.id}`)
  }

  const host = defineComponent(
    () => () =>
      h(
        QueryTable,
        {
          query: query.value,
          columns: tableColumns,
          rows: answer.value.rows,
          totalRows: answer.value.totalRows,
          cursors: answer.value.cursors,
          loading: loading.value,
          filterDebounce: 0,
          searchDebounce: options.searchDebounce ?? 0,
          pagination: {
            pageSizeOptions: options.pageSizeOptions ?? [5, 10, 50]
          },
          rowKey: (row: object) => (row as { id: number }).id,
          sortable: true,
          filterable: true,
          hasSubtable: options.subtable ?? false,
          hasRightPanel: options.rightPanel ?? false,
          ...(options.selection
            ? {
                selection: selection.value,
                'onUpdate:selection': (next: RowSelection) => {
                  selections.push({ ...next })
                  selection.value = next
                }
              }
            : {}),
          ...options.props,
          'onUpdate:query': onQuery
        },
        slots as never
      )
  )
  const screen = await render(host)

  const root = () =>
    screen.container.querySelector<HTMLElement>('.qt-datatable')!
  const ids = () =>
    [
      ...screen.container.querySelectorAll(
        '.qt-table > tbody > tr[data-row-index] > td[data-field="id"]'
      )
    ].map(cell => Number(cell.textContent))
  /** The ids of the rows drawn with `data-expanded`. */
  const expandedIds = () =>
    [
      ...screen.container.querySelectorAll(
        '.qt-table > tbody > tr[data-expanded] > td[data-field="id"]'
      )
    ].map(cell => Number(cell.textContent))
  const selectedIds = () =>
    [
      ...screen.container.querySelectorAll(
        '.qt-table > tbody > tr[data-selected] > td[data-field="id"]'
      )
    ].map(cell => Number(cell.textContent))
  /** The row of an id, by its cell. */
  const rowOf = (id: number) => {
    const cell = [
      ...screen.container.querySelectorAll<HTMLElement>(
        '.qt-table > tbody > tr[data-row-index] > td[data-field="id"]'
      )
    ].find(td => Number(td.textContent) === id)
    if (!cell) {
      throw new Error(`no row with id ${id}`)
    }
    return cell.parentElement as HTMLTableRowElement
  }
  const inRow = (id: number, css: string) =>
    page.elementLocator(rowOf(id).querySelector(css)!)
  const filter = (field: string) =>
    page.getByCSS(`th[data-field="${field}"] .qt-filter-input`)
  const sortButton = (field: string) =>
    page.getByCSS(`th[data-field="${field}"] .qt-sort`)
  const pageInfo = () =>
    screen.container.querySelector('.page-info')?.textContent?.trim()

  return {
    screen,
    updates,
    selections,
    requests,
    selection: () => selection.value,
    query: () => query.value,
    respond,
    reload: request,
    root,
    ids,
    expandedIds,
    selectedIds,
    rowOf,
    inRow,
    filter,
    sortButton,
    pageInfo
  }
}

/**
 * Waits until `updates` holds exactly `expected`, then one more macrotask: a
 * second update of the same action (C-04) would land there and fail the
 * comparison.
 */
export const expectUpdates = async (
  updates: readonly ScenarioUpdate[],
  expected: readonly ScenarioUpdate[]
) => {
  await expect.poll(() => updates.length).toBe(expected.length)
  await sleep(0)
  expect(updates).toEqual(expected)
}

/** The ids of a page of `list`: what the server answers for that page. */
export const pageIds = (
  list: ReadonlyArray<{ id: number }>,
  pageNumber: number,
  size: number
) => list.slice((pageNumber - 1) * size, pageNumber * size).map(row => row.id)
