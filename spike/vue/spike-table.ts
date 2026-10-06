// Spike sketch of the Vue layer: a controlled table on `@tanstack/vue-table`
// with the two plugins. Every TanStack slice the consumer owns is passed as a
// projection of a prop (D2); the table keeps no state of its own besides the
// plugins' short-lived base and pending text.
import {
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
  functionalUpdate,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  type Updater,
  useTable
} from '@tanstack/vue-table'
import {
  computed,
  defineComponent,
  h,
  onScopeDispose,
  type PropType
} from 'vue'

import type { Column } from '../../src/contract'
import { filterInputFeature } from '../core/filter-input-feature'
import {
  type PageCursors,
  type Paging,
  type Reason,
  type SpikeQuery,
  toColumnFilters,
  toPageCount,
  toPagination,
  toSorting
} from '../core/query'
import { serverQueryFeature } from '../core/server-query-feature'
import { dispose } from '../core/shared'

export interface SpikeRow {
  id: number
  [key: string]: unknown
}

export type Selection = Record<string, boolean>

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  rowSelectionFeature,
  columnSizingFeature,
  columnResizingFeature,
  serverQueryFeature,
  filterInputFeature
} as never)

const pixels = (width: string | undefined): number | undefined => {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(width ?? '')
  return match ? Number(match[1]) : undefined
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- a component
export const SpikeTable = defineComponent({
  name: 'SpikeTable',
  props: {
    query: { type: Object as PropType<SpikeQuery>, required: true },
    columns: { type: Array as PropType<Column[]>, required: true },
    rows: { type: Array as PropType<SpikeRow[]>, required: true },
    totalRows: { type: Number, default: undefined },
    pagingMode: { type: String as PropType<Paging['mode']>, default: 'page' },
    cursors: { type: Object as PropType<PageCursors>, default: undefined },
    selection: { type: Object as PropType<Selection>, default: () => ({}) }
  },
  // update:query (query, reason), update:selection (selection),
  // columnResize ({ field, width })
  emits: ['update:query', 'update:selection', 'columnResize'],
  setup(props, { emit, expose }) {
    const paging = computed<Paging>(() => ({
      mode: props.pagingMode,
      totalRows: props.totalRows,
      cursors: props.cursors
    }))
    // D3: `Column.width` stays a CSS string; only pixel widths reach
    // TanStack, and only as the start of a drag.
    const sizing = computed(() =>
      Object.fromEntries(
        props.columns.flatMap(column => {
          const width = pixels(column.width)
          return width === undefined ? [] : [[column.field, width]]
        })
      )
    )

    const table = useTable({
      features,
      get columns() {
        return props.columns.map(column => ({
          id: column.field,
          accessorKey: column.field,
          header: column.title ?? column.field,
          meta: { type: column.type }
        }))
      },
      get data() {
        return props.rows
      },
      getRowId: (row: SpikeRow) => String(row.id),
      // serverQueryFeature options
      get query() {
        return props.query
      },
      onQueryChange: (query: SpikeQuery, reason: Reason) =>
        emit('update:query', query, reason),
      get paging() {
        return paging.value
      },
      get pageCount() {
        return toPageCount(props.query, paging.value)
      },
      enableRowSelection: true,
      columnResizeMode: 'onEnd',
      state: {
        get sorting() {
          return toSorting(props.query)
        },
        get columnFilters() {
          return toColumnFilters(props.query)
        },
        get pagination() {
          return toPagination(props.query, paging.value)
        },
        // K6: row selection is the consumer's too (`v-model:selection`).
        get rowSelection() {
          return props.selection
        },
        get columnSizing() {
          return sizing.value
        }
      },
      onRowSelectionChange: (updater: Updater<Selection>) =>
        emit('update:selection', {
          ...functionalUpdate(updater, props.selection)
        }),
      onColumnSizingChange: (updater: Updater<Record<string, number>>) => {
        const next = functionalUpdate(updater, sizing.value)
        for (const [field, width] of Object.entries(next)) {
          if (width !== sizing.value[field]) {
            // C-49 (own): whole pixels; the clamp to min/max is left out here.
            emit('columnResize', { field, width: Math.round(width) })
          }
        }
      }
    } as never) as never as SpikeTableApi

    onScopeDispose(() => dispose(table))
    expose({ table })

    return () =>
      h('table', { class: 'spike' }, [
        h(
          'thead',
          table.getHeaderGroups().map(group =>
            h(
              'tr',
              group.headers.map(header =>
                h(
                  'th',
                  {
                    'data-field': header.column.id,
                    style: { width: `${header.getSize()}px` }
                  },
                  [
                    h(
                      'button',
                      {
                        class: 'sort',
                        'data-sort': header.column.getIsSorted() || undefined,
                        onClick: header.column.getToggleSortingHandler()
                      },
                      String(header.column.columnDef.header)
                    ),
                    h('div', {
                      class: 'resize',
                      onMousedown: header.getResizeHandler()
                    })
                  ]
                )
              )
            )
          )
        ),
        h(
          'tbody',
          table.getRowModel().rows.map(row =>
            h(
              'tr',
              {
                'data-key': row.id,
                'data-selected': row.getIsSelected() || undefined
              },
              [
                h('td', [
                  h('input', {
                    type: 'checkbox',
                    checked: row.getIsSelected(),
                    onChange: row.getToggleSelectedHandler()
                  })
                ]),
                ...row
                  .getAllCells()
                  .map(cell => h('td', String(cell.getValue())))
              ]
            )
          )
        ),
        h('tfoot', [
          h('tr', [
            h('td', [
              h(
                'button',
                {
                  class: 'prev',
                  disabled: !table.getCanPreviousPage(),
                  onClick: () => table.previousPage()
                },
                'Prev'
              ),
              h(
                'button',
                {
                  class: 'next',
                  disabled: !table.getCanNextPage(),
                  onClick: () => table.nextPage()
                },
                'Next'
              )
            ])
          ])
        ])
      ])
  }
})

/** The slice of the table API the spike harness and its tests use. */
export interface SpikeTableApi {
  options: Record<string, unknown>
  getHeaderGroups: () => {
    headers: {
      column: {
        id: string
        columnDef: { header?: unknown }
        getIsSorted: () => false | 'asc' | 'desc'
        getToggleSortingHandler: () => (event: unknown) => void
        toggleSorting: (desc?: boolean) => void
        getSize: () => number
      }
      getSize: () => number
      getResizeHandler: () => (event: unknown) => void
    }[]
  }[]
  getRowModel: () => {
    rows: {
      id: string
      getIsSelected: () => boolean
      getToggleSelectedHandler: () => (event: unknown) => void
      toggleSelected: (value?: boolean) => void
      getAllCells: () => { getValue: () => unknown }[]
    }[]
  }
  getColumn: (
    id: string
  ) =>
    | { toggleSorting: (desc?: boolean) => void; getSize: () => number }
    | undefined
  getCanPreviousPage: () => boolean
  getCanNextPage: () => boolean
  getPageCount: () => number
  previousPage: () => void
  nextPage: () => void
  setPageIndex: (index: number) => void
  setPageSize: (size: number) => void
  setColumnSizing: (updater: Updater<Record<string, number>>) => void
  toggleAllPageRowsSelected: (value?: boolean) => void
  getIsAllPageRowsSelected: () => boolean
  getSelectedRowModel: () => { rows: { id: string }[] }
  setFilterText: (field: string, text: string) => void
  flushPendingFilters: () => void
  getBaseQuery: () => SpikeQuery
  atoms: Record<string, { get: () => unknown }>
}
