import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'

import QueryTable, {
  type CursorQuery,
  type PaginationSlotProps,
  type Query,
  type QueryChangeReason,
  type TableQuery,
  type ToolbarSlotProps
} from '@dolusoft/query-table'

import { columns, makeQuery } from './fixtures'
import { traceUpdate } from './trace'
import TablePager from '../../apps/playground/harness/TablePager.vue'
import {
  createDemoRows,
  cursorDemoPage,
  queryDemoRows,
  searchDemoRows
} from '../../apps/playground/scenarios/fake-server'

/** A consumer with a request log and explicitly completed server answers. */
export const renderServerFlow = async (
  initial: Query = makeQuery(),
  options: { deferred?: boolean; searchDebounce?: number } = {}
) => {
  const allRows = createDemoRows()
  const tableColumns = columns()
  const query = ref(initial)
  const answerFor = (asked: Query) => {
    if ('cursor' in asked) {
      return { ...cursorDemoPage(allRows, asked), totalRows: null }
    }
    return {
      ...queryDemoRows(searchDemoRows(allRows, asked.search), asked),
      cursors: { next: null, prev: null }
    }
  }
  const answer = shallowRef(answerFor(initial))
  const loading = ref(false)
  const updates: Array<{ query: Query; reason: QueryChangeReason }> = []
  const requests: Query[] = []
  let latest = -1
  const respond = async (index: number) => {
    // Stale-response protection is consumer policy, not library behavior.
    if (index === latest) {
      answer.value = answerFor(requests[index])
      loading.value = false
    }
    await nextTick()
  }
  const request = () => {
    requests.push(JSON.parse(JSON.stringify(query.value)) as Query)
    latest = requests.length - 1
    if (options.deferred) {
      loading.value = true
    } else {
      answer.value = answerFor(query.value)
    }
  }
  const update = (next: Query, reason: QueryChangeReason) => {
    // The existing trace recorder is typed with the legacy page-query alias;
    // its JSON snapshots also preserve cursor queries without modification.
    traceUpdate(next as TableQuery, reason)
    updates.push({
      query: JSON.parse(JSON.stringify(next)) as Query,
      reason
    })
    query.value = next
    request()
  }
  // The initial fetch is a consumer request, never an update from the table.
  request()
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
          pagination: { pageSizeOptions: [5, 10, 50] },
          rowKey: (row: object) => (row as { id: number }).id,
          hasRightPanel: true,
          sortable: true,
          filterable: true,
          'onUpdate:query': update
        },
        {
          toolbar: (bar: ToolbarSlotProps) =>
            h('input', {
              type: 'search',
              'aria-label': 'Search name or city',
              value: bar.search,
              onInput: (event: Event) =>
                bar.setSearch((event.target as HTMLInputElement).value),
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                  bar.applySearch()
                }
              }
            }),
          pagination: (pager: PaginationSlotProps) =>
            h('div', [
              h(TablePager, { page: pager }),
              h('output', { class: 'server-total' }, String(pager.totalRows)),
              h(
                'output',
                { class: 'server-page-count' },
                String(pager.pageCount)
              ),
              h('output', { class: 'server-page' }, String(pager.page))
            ]),
          empty: () => 'No results.',
          loading: () => 'Loading…'
        }
      )
  )
  const screen = await render(host)
  const restore = async (next: Query) => {
    query.value = next
    request()
    await nextTick()
  }
  const filter = (field: string) =>
    page.getByCSS(`th[data-field="${field}"] .qt-filter-input`)
  const ids = () =>
    [...screen.container.querySelectorAll('tbody td[data-field="id"]')].map(
      cell => Number(cell.textContent)
    )
  return { screen, updates, requests, respond, restore, filter, ids }
}

export const cursorQuery = (
  overrides: Partial<CursorQuery> = {}
): CursorQuery => ({
  cursor: null,
  pageSize: 10,
  sort: null,
  filters: [],
  ...overrides
})
