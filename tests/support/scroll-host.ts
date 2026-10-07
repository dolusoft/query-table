import { defineComponent, h, ref, shallowRef, type PropType } from 'vue'

import QueryTable, {
  type Column,
  type QueryChangeReason,
  type TableQuery
} from '@dolusoft/query-table'

// A consumer of the 3.2 scroll features in the browser tests (C-83 to
// C-91): a fixed-height scroll box around the table, a fake server that
// answers page actions by appending rows (infinite) and every other
// change by replacing them.

export interface ScrollRow {
  id: number
  name: string
  age: number
}

const scrollColumns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'number' }
]

export const scrollRows = (count: number, from = 0): ScrollRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: from + i + 1,
    name: `Name ${from + i + 1}`,
    age: 20 + ((from + i) % 50)
  }))

export interface HostApi {
  table: () => {
    scrollToIndex(index: number, options?: { align?: string }): void
    loadMore(): void
  }
  box: () => HTMLElement
  events: Array<[TableQuery, QueryChangeReason]>
  /** Answer the pending request; `false` answers with an error (no rows). */
  answer: (ok?: boolean) => void
  setRows: (rows: ScrollRow[]) => void
  setLoading: (loading: boolean) => void
}

export const ScrollHost = defineComponent({
  props: {
    rows: { type: Array as PropType<ScrollRow[]>, required: true },
    tableProps: { type: Object, default: () => ({}) },
    /** Height of the scroll box in pixels; `0` for no box (the window scrolls). */
    height: { type: Number, default: 300 },
    /** Answer page actions by itself, right away. */
    auto: { type: Boolean, default: false },
    pageSize: { type: Number, default: 50 },
    totalRows: { type: Number as PropType<number | null>, default: null },
    slots: { type: Object, default: () => ({}) },
    api: { type: Function as PropType<(api: HostApi) => void>, required: true }
  },
  setup(props) {
    const query = ref<TableQuery>({
      page: 1,
      pageSize: props.pageSize,
      sort: null,
      filters: []
    })
    const rows = shallowRef(props.rows)
    const loading = ref(false)
    const tableRef = shallowRef<HostApi['table'] | null>(null)
    const boxRef = shallowRef<HTMLElement | null>(null)
    const events: HostApi['events'] = []
    let pending: TableQuery | null = null
    /** The query of the rows shown, put back after an error (C-89). */
    let shown = query.value

    const answer = (ok = true) => {
      const next = pending
      pending = null
      loading.value = false
      if (!next) {
        return
      }
      if (!ok) {
        query.value = shown
        return
      }
      shown = next
      rows.value = [
        ...rows.value,
        ...scrollRows(next.pageSize, rows.value.length)
      ]
    }

    const onUpdate = (next: TableQuery, reason: QueryChangeReason) => {
      events.push([next, reason])
      query.value = next
      if (reason === 'page') {
        pending = next
        loading.value = true
        if (props.auto) {
          setTimeout(() => answer(), 0)
        }
      } else {
        shown = next
      }
    }

    props.api({
      table: () => tableRef.value as never,
      box: () => boxRef.value!,
      events,
      answer,
      setRows: next => {
        rows.value = next
      },
      setLoading: value => {
        loading.value = value
      }
    })

    return () => {
      const table = h(
        QueryTable as never,
        {
          ref: tableRef,
          columns: scrollColumns(),
          rows: rows.value,
          totalRows: props.totalRows,
          query: query.value,
          loading: loading.value,
          rowKey: 'id',
          'onUpdate:query': onUpdate,
          ...props.tableProps
        },
        props.slots
      )
      return props.height > 0
        ? h(
            'div',
            {
              ref: boxRef,
              class: 'scroll-box',
              style: `height: ${props.height}px; overflow-y: auto;`
            },
            [table]
          )
        : h('div', { ref: boxRef }, [table])
    }
  }
})

/** The layout C-85 recommends, for the tables of these tests. */
export const useFixedLayout = () => {
  const style = document.createElement('style')
  style.textContent = '.qt-table.qt-table { table-layout: fixed; }'
  document.head.append(style)
  return () => style.remove()
}

export const frames = async (n = 3) => {
  for (let i = 0; i < n; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve))
  }
}

/** Data rows drawn in the body, by `data-row-index`. */
export const drawnIndexes = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      '.qt-table tbody > tr[data-row-index]'
    )
  ].map(tr => Number(tr.dataset.rowIndex))

export const spacers = () => [
  ...document.querySelectorAll<HTMLElement>(
    '.qt-table tbody > tr.qt-virtual-spacer'
  )
]

/** Scroll the box (or the window) and let the table follow. */
export const scrollTo = async (box: HTMLElement | null, top: number) => {
  if (box) {
    box.scrollTop = top
    box.dispatchEvent(new Event('scroll'))
  } else {
    window.scrollTo(0, top)
  }
  await frames(4)
}
