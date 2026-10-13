import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { defineComponent, h, shallowRef, type PropType } from 'vue'

import QueryTable, {
  type Column,
  type ColumnResizePayload,
  type QueryTableExpose,
  type TableQuery
} from '@dolusoft/query-table'

import { el, makeQuery } from '../../support/fixtures'

// Measuring column widths (C-96) and the autofit that uses it (C-50), with
// the slot content a product draws: a flex header (label, then a button
// pushed to the end) and cells that are a block box. Both stretch to their
// cell, so a measure of the drawn box returns the cell's width, whatever the
// content needs. The consumer CSS is the one C-50 recommends: a fixed layout
// that grows with its columns.

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

const tableRows = (): Row[] => [
  { id: 1, name: 'Ann', code: '7' },
  { id: 2, name: longName, code: '42' },
  { id: 3, name: 'Bo', code: '514' }
]

const wideColumns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number', width: '300px' },
  { field: 'name', title: 'Name', width: '600px' },
  { field: 'code', title: 'Code', width: '400px' }
]

interface HostApi {
  table: () => QueryTableExpose
  resized: ColumnResizePayload[]
  updates: TableQuery[]
}

const Host = defineComponent({
  props: {
    columns: { type: Array as PropType<Column[]>, default: wideColumns },
    rows: { type: Array as PropType<Row[]>, default: tableRows },
    tableProps: { type: Object, default: () => ({}) },
    slotContent: { type: Boolean, default: true },
    api: { type: Function as PropType<(api: HostApi) => void>, required: true }
  },
  setup(props) {
    const query = shallowRef(makeQuery())
    const table = shallowRef<QueryTableExpose | null>(null)
    const api: HostApi = {
      table: () => table.value!,
      resized: [],
      updates: []
    }
    props.api(api)
    const slots = (): Record<string, unknown> => {
      if (!props.slotContent) {
        return {}
      }
      const out: Record<string, unknown> = {}
      for (const column of props.columns) {
        out[`header-${column.field}`] = () =>
          h('div', { class: 'measure-title' }, [
            h('span', column.title),
            h('button', { type: 'button', class: 'measure-pin' }, 'p')
          ])
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
          // A product's header and cell slots: both stretch to their cell.
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
            ref: table,
            query: query.value,
            columns: props.columns,
            rows: props.rows,
            totalRows: props.rows.length,
            resizable: true,
            filterable: true,
            'onUpdate:query': (next: TableQuery) => {
              api.updates.push(next)
              query.value = next
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
  const rerender = async (next: Record<string, unknown>) => {
    await screen.rerender(next as never)
    await frames()
  }
  return { api, rerender }
}

/** Every `style` attribute in the table, in document order. */
const styles = () =>
  [el('.qt-table'), ...el('.qt-table').querySelectorAll('*')].map(node =>
    node.getAttribute('style')
  )

/** Width of a text run as the browser draws it. */
const textWidth = (node: Element) => {
  const range = document.createRange()
  range.selectNodeContents(node)
  return range.getBoundingClientRect().width
}

const fitted = (widths: Record<string, number>) =>
  wideColumns().map(column => ({
    ...column,
    width: `${widths[column.field]}px`
  }))

describe('C-96 Measuring column widths [own]', () => {
  test('measures the content of block and flex slots, not the width of their cells', async () => {
    const { api, rerender } = await mount()
    const widths = api.table().measureColumnWidths()
    expect(Object.keys(widths).sort()).toEqual(['code', 'id', 'name'])
    // Far below the declared widths the cells are drawn at.
    expect(widths.id).toBeLessThan(150)
    expect(widths.code).toBeLessThan(150)
    expect(widths.name).toBeLessThan(500)
    // The longest name sets its column: its text plus the cell's padding and
    // border, within the rounding.
    const td = el('tbody tr[data-row-index="1"] td[data-field="name"]')
    const style = getComputedStyle(td)
    const chrome = [
      style.paddingLeft,
      style.paddingRight,
      style.borderLeftWidth,
      style.borderRightWidth
    ].reduce((sum, value) => sum + (parseFloat(value) || 0), 0)
    const need = textWidth(td.querySelector('.measure-text')!) + chrome
    expect(widths.name).toBeGreaterThanOrEqual(Math.floor(need))
    expect(widths.name).toBeLessThanOrEqual(Math.ceil(need) + 1)

    // Written back, every text and every header button fits its cell.
    await rerender({ columns: fitted(widths) })
    for (const text of document.querySelectorAll<HTMLElement>(
      '.qt-table .measure-text'
    )) {
      expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth)
    }
    for (const th of document.querySelectorAll<HTMLElement>(
      '.qt-table thead th[data-field]'
    )) {
      const pin = th.querySelector('.measure-pin')!
      expect(pin.getBoundingClientRect().right).toBeLessThanOrEqual(
        th.getBoundingClientRect().right + 0.5
      )
    }
  })

  test('puts every style back, emits nothing and keeps no width', async () => {
    const { api } = await mount()
    const before = styles()
    const html = el('.qt-table').outerHTML
    api.table().measureColumnWidths()
    expect(styles()).toEqual(before)
    expect(el('.qt-table').outerHTML).toBe(html)
    await frames()
    expect(el('thead th[data-field="name"]').style.width).toBe('600px')
    expect(api.updates).toEqual([])
    expect(api.resized).toEqual([])
  })

  test('does not count the filter row, the footer or a subtable row', async () => {
    const { api, rerender } = await mount()
    const alone = api.table().measureColumnWidths()
    await rerender({
      tableProps: {
        hasSubtable: true,
        rowKey: 'id',
        footerRows: [
          {
            cells: [
              { field: 'code', text: 'A footer text far wider than any code' }
            ]
          }
        ]
      }
    })
    el('tbody tr[data-row-index="0"] .qt-expand').click()
    await frames()
    expect(document.querySelector('.qt-subtable-row')).not.toBeNull()
    const withParts = api.table().measureColumnWidths()
    expect(withParts.code).toBe(alone.code)
    expect(withParts.name).toBe(alone.name)
    // The filter input of a short column is wider than its content needs.
    const input = el('thead th[data-field="code"] .qt-filter-input')
    expect(input).not.toBeNull()
    expect(alone.code).toBeLessThan(150)
  })

  test('returns only the fields asked for, and leaves out hidden columns and a table not displayed', async () => {
    const { api, rerender } = await mount()
    expect(
      Object.keys(api.table().measureColumnWidths(['name', 'nope']))
    ).toEqual(['name'])
    await rerender({
      columns: wideColumns().map(column =>
        column.field === 'id' ? { ...column, hide: true } : column
      )
    })
    expect(Object.keys(api.table().measureColumnWidths()).sort()).toEqual([
      'code',
      'name'
    ])
    el('.qt-datatable').parentElement!.style.display = 'none'
    expect(api.table().measureColumnWidths()).toEqual({})
  })

  test('plain cells measure the same text as slot content', async () => {
    const slotted = await mount()
    const withSlots = slotted.api.table().measureColumnWidths(['name'])
    cleanup()
    const plain = await mount({ slotContent: false })
    const withoutSlots = plain.api.table().measureColumnWidths(['name'])
    // The same text in a block span and as a bare text node.
    expect(Math.abs(withSlots.name - withoutSlots.name)).toBeLessThanOrEqual(1)
  })
})

describe('C-50 Keyboard and autofit with block and flex slot content [own]', () => {
  test('a double click fits the content of the slots', async () => {
    const { api } = await mount()
    const handle = el('thead th[data-field="code"] .qt-resize-handle')
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(api.resized).toHaveLength(1)
    expect(api.resized[0].field).toBe('code')
    expect(api.resized[0].width).toBe(
      api.table().measureColumnWidths(['code']).code
    )
    expect(api.resized[0].width).toBeLessThan(150)
  })

  test('Enter on a table that is not displayed emits nothing', async () => {
    const { api } = await mount()
    const handle = el('thead th[data-field="code"] .qt-resize-handle')
    el('.qt-datatable').parentElement!.style.display = 'none'
    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    )
    expect(api.resized).toEqual([])
  })
})
