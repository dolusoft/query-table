import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { defineComponent, h, type PropType } from 'vue'

import QueryTable, {
  type Column,
  type ColumnResizePayload,
  type QueryTableExpose,
  type TableQuery
} from '@dolusoft/query-table'

import { el, makeQuery, rule } from '../../support/fixtures'

// Automatic column widths (C-100): with `autoWidth` every visible column
// without a width is drawn at what `measureColumnWidths` (C-99) measures for
// it, after the drawn rows change. The slots and the consumer CSS are the ones
// of the C-99 test: a flex header, block cells and the fixed layout C-50
// recommends.

afterEach(() => {
  cleanup()
})

const frames = async (count = 3) => {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve))
  }
}

interface Row {
  id: number
  name: string
  code: string
}

const longName = 'A name that is clearly longer than the rest'
const longerName = `${longName}, and longer still than that`

const rowsWith = (name: string): Row[] => [
  { id: 1, name: 'Ann', code: '7' },
  { id: 2, name, code: '42' },
  { id: 3, name: 'Bo', code: '514' }
]

const shortRows = (): Row[] => [
  { id: 4, name: 'Cy', code: '1' },
  { id: 5, name: 'Di', code: '2' }
]

const autoColumns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number' },
  { field: 'name', title: 'Name' },
  { field: 'code', title: 'Code' }
]

interface HostApi {
  table: () => QueryTableExpose
  resized: ColumnResizePayload[]
  updates: TableQuery[]
  columnUpdates: Column[][]
  /** `width` of the column each header slot received, by field. */
  slotWidths: Record<string, string | undefined>
}

const Host = defineComponent({
  props: {
    columns: { type: Array as PropType<Column[]>, default: autoColumns },
    rows: { type: Array as PropType<Row[]>, default: () => rowsWith(longName) },
    query: { type: Object as PropType<TableQuery>, default: () => makeQuery() },
    tableProps: { type: Object, default: () => ({ autoWidth: true }) },
    api: { type: Function as PropType<(api: HostApi) => void>, required: true }
  },
  setup(props) {
    let table: QueryTableExpose | null = null
    const api: HostApi = {
      table: () => table!,
      resized: [],
      updates: [],
      columnUpdates: [],
      slotWidths: {}
    }
    props.api(api)
    const slots = (): Record<string, unknown> => {
      const out: Record<string, unknown> = {}
      for (const column of props.columns) {
        out[`header-${column.field}`] = ({
          column: given
        }: {
          column: Column
        }) => {
          api.slotWidths[given.field] = given.width
          return h('div', { class: 'measure-title' }, [
            h('span', given.title),
            h('button', { type: 'button', class: 'measure-pin' }, 'p')
          ])
        }
        out[`cell-${column.field}`] = ({ cellValue }: { cellValue: unknown }) =>
          h(
            'span',
            { class: 'measure-text' },
            typeof cellValue === 'string' || typeof cellValue === 'number'
              ? String(cellValue)
              : ''
          )
      }
      return out
    }
    return () =>
      h('div', [
        h(
          'style',
          `.measure-title { display: flex; align-items: center; }
           .measure-pin { margin-left: auto; width: 18px; padding: 0; }
           .measure-text { display: block; overflow: hidden;
             text-overflow: ellipsis; white-space: nowrap; }
           .qt-table { width: max-content; min-width: 100%;
             table-layout: fixed; }`
        ),
        h(
          QueryTable as never,
          {
            ref: (instance: unknown) => {
              table = instance as QueryTableExpose | null
            },
            query: props.query,
            columns: props.columns,
            rows: props.rows,
            totalRows: props.rows.length,
            rowKey: 'id',
            resizable: true,
            filterable: true,
            'onUpdate:query': (next: TableQuery) => {
              api.updates.push(next)
            },
            'onUpdate:columns': (next: Column[]) => {
              api.columnUpdates.push(next)
            },
            onColumnResize: (payload: ColumnResizePayload) => {
              api.resized.push(payload)
            },
            ...props.tableProps
          },
          slots() as never
        )
      ])
  }
})

const mount = async (props: Record<string, unknown> = {}) => {
  let api!: HostApi
  const screen = await render(
    Host as never,
    {
      props: { api: (given: HostApi) => (api = given), ...props }
    } as never
  )
  await frames()
  let current = { ...props }
  const rerender = async (next: Record<string, unknown>) => {
    current = { ...current, ...next }
    await screen.rerender(current as never)
    await frames()
  }
  return { api, rerender }
}

/** The inline `width` of a header cell. */
const drawn = (field: string) =>
  el(`thead th[data-field="${field}"]`).style.width

/** The inline width of a header cell as a number of pixels. */
const drawnPx = (field: string) => parseFloat(drawn(field))

describe('C-100 Automatic column widths [own]', () => {
  test('draws each column without a width at its measured width, and emits nothing', async () => {
    const columns = autoColumns().map(column =>
      column.field === 'code' ? { ...column, width: '300px' } : column
    )
    const { api } = await mount({ columns })
    const measured = api.table().measureColumnWidths()
    expect(drawn('id')).toBe(`${Math.max(40, measured.id)}px`)
    expect(drawn('name')).toBe(`${measured.name}px`)
    // A column with a width keeps it.
    expect(drawn('code')).toBe('300px')
    // Drawn, not given: the slot sees the column as the consumer wrote it.
    expect(api.slotWidths.name).toBeUndefined()
    expect(api.updates).toEqual([])
    expect(api.columnUpdates).toEqual([])
    expect(api.resized).toEqual([])
    // Every text fits its cell.
    for (const text of document.querySelectorAll<HTMLElement>(
      '.qt-table .measure-text'
    )) {
      expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth)
    }
  })

  test('is off by default', async () => {
    await mount({ tableProps: {} })
    expect(drawn('name')).toBe('')
    expect(drawn('code')).toBe('')
  })

  test('clamps as a resize does, with autoWidthMax for a column without maxWidth', async () => {
    const columns = autoColumns().map(column =>
      column.field === 'id'
        ? { ...column, minWidth: 150 }
        : column.field === 'code'
          ? { ...column, maxWidth: 45 }
          : column
    )
    const { api } = await mount({
      columns,
      tableProps: { autoWidth: true, autoWidthMax: 100 }
    })
    expect(drawn('id')).toBe('150px')
    expect(api.table().measureColumnWidths(['name']).name).toBeGreaterThan(100)
    expect(drawn('name')).toBe('100px')
    // The column's own maximum wins over `autoWidthMax`.
    expect(drawnPx('code')).toBeLessThanOrEqual(45)
  })

  test('within one query the widths only grow: another page, page size or sort keeps them', async () => {
    const { rerender } = await mount()
    const wide = drawnPx('name')
    await rerender({ query: makeQuery({ page: 2 }), rows: shortRows() })
    expect(drawnPx('name')).toBe(wide)
    await rerender({
      query: makeQuery({
        page: 2,
        pageSize: 25,
        sort: { field: 'name', direction: 'asc' }
      }),
      rows: shortRows()
    })
    expect(drawnPx('name')).toBe(wide)
    await rerender({
      query: makeQuery({ page: 3 }),
      rows: rowsWith(longerName)
    })
    expect(drawnPx('name')).toBeGreaterThan(wide)
  })

  test('a new query and rowsUpdate reset measure from scratch', async () => {
    const { rerender } = await mount()
    const wide = drawnPx('name')
    await rerender({
      query: makeQuery({ filters: [rule('code', 'Equal', '1')] }),
      rows: shortRows()
    })
    expect(drawnPx('name')).toBeLessThan(wide)

    await rerender({ rows: rowsWith(longName) })
    expect(drawnPx('name')).toBe(wide)
    await rerender({
      rows: shortRows(),
      tableProps: { autoWidth: true, rowsUpdate: 'reset' }
    })
    expect(drawnPx('name')).toBeLessThan(wide)
  })

  test('a width given wins, and a width taken away goes back to the automatic one', async () => {
    const { rerender } = await mount()
    const auto = drawn('name')
    await rerender({
      columns: autoColumns().map(column =>
        column.field === 'name' ? { ...column, width: '500px' } : column
      )
    })
    expect(drawn('name')).toBe('500px')
    await rerender({ columns: autoColumns() })
    expect(drawn('name')).toBe(auto)
  })

  test('with no data rows nothing is measured and the widths stay', async () => {
    const { rerender } = await mount()
    const wide = drawn('name')
    await rerender({ rows: [] })
    expect(drawn('name')).toBe(wide)
  })

  test('a table not displayed keeps its widths and measures once displayed', async () => {
    const { rerender } = await mount()
    const wide = drawnPx('name')
    const box = el('.qt-datatable').parentElement!
    box.style.display = 'none'
    await rerender({
      query: makeQuery({ page: 2 }),
      rows: rowsWith(longerName)
    })
    expect(drawnPx('name')).toBe(wide)
    box.style.display = ''
    await frames(4)
    expect(drawnPx('name')).toBeGreaterThan(wide)
  })

  test('turned off, the automatic widths go', async () => {
    const { rerender } = await mount()
    expect(drawn('name')).not.toBe('')
    await rerender({ tableProps: { autoWidth: false } })
    expect(drawn('name')).toBe('')
  })
})
