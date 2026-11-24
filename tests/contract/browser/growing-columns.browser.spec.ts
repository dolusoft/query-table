import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { defineComponent, h, shallowRef, type PropType } from 'vue'

import QueryTable, {
  type Column,
  type ColumnResizePayload
} from '@dolusoft/query-table'

import { el, makeQuery } from '../../support/fixtures'

// C-132 in a real browser: the room of a container wider than the table goes
// to the columns with `grow`, and a drag in such a table (ADR 0024 and its
// amendment). With the CSS C-50 recommends. Not compared with a 3.20
// baseline (`ADDED_AFTER_BASELINE`).

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const frames = async (count = 4) => {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve))
  }
}

interface Row {
  id: number
  name: string
  note: string
}

const rows: Row[] = [
  { id: 1, name: 'alice', note: 'first' },
  { id: 2, name: 'bob', note: 'second' },
  { id: 3, name: 'carol', note: 'third' }
]

const columns = (): Column[] => [
  { field: 'id', title: 'ID', width: '60px' },
  { field: 'name', title: 'Name', width: '100px', grow: 1 },
  { field: 'note', title: 'Note', width: '100px', grow: 3 }
]

interface HostApi {
  resized: ColumnResizePayload[]
  columnUpdates: number
  setWidth: (width: number) => void
}

const Host = defineComponent({
  props: {
    columns: { type: Array as PropType<Column[]>, default: columns },
    width: { type: Number, default: 1000 },
    tableProps: { type: Object, default: () => ({}) },
    api: { type: Function as PropType<(api: HostApi) => void>, required: true }
  },
  setup(props) {
    // `v-model:columns`: a resize writes its width back.
    const current = shallowRef(props.columns)
    const width = shallowRef(props.width)
    const api: HostApi = {
      resized: [],
      columnUpdates: 0,
      setWidth: next => {
        width.value = next
      }
    }
    props.api(api)
    return () =>
      h('div', { class: 'grow-host', style: { width: `${width.value}px` } }, [
        h(
          'style',
          `.grow-host .qt-table { width: max-content; min-width: 100%;
             table-layout: fixed; }
           .grow-host .qt-table-responsive { padding: 0; }`
        ),
        h(QueryTable as never, {
          query: makeQuery(),
          columns: current.value,
          rows,
          totalRows: rows.length,
          rowKey: 'id',
          resizable: true,
          'onUpdate:columns': (next: Column[]) => {
            api.columnUpdates += 1
            current.value = next
          },
          onColumnResize: (payload: ColumnResizePayload) => {
            api.resized.push(payload)
          },
          ...props.tableProps
        })
      ])
  }
})

const mount = async (props: Record<string, unknown> = {}) => {
  let api!: HostApi
  await render(
    Host as never,
    { props: { api: (given: HostApi) => (api = given), ...props } } as never
  )
  await frames()
  return api
}

const widthOf = (selector: string) => el(selector).getBoundingClientRect().width
const header = (field: string) => `thead th[data-field="${field}"]`
/** The container's width inside its scrollbar (the skin gives it no padding here). */
const inner = () => el('.qt-table-responsive').clientWidth
const near = (actual: number, expected: number, within = 1) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(within)

/** A drag with the mouse pointer (id 1) on the handle of `field`. */
const drag = async (field: string, dx: number) => {
  const handle = el(`${header(field)} .qt-resize-handle`)
  const box = handle.getBoundingClientRect()
  const x = box.left + box.width / 2
  const fire = (type: string, clientX: number) =>
    handle.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX,
        clientY: box.top + box.height / 2,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1
      })
    )
  fire('pointerdown', x)
  for (let step = 1; step <= 4; step++) {
    fire('pointermove', x + (dx * step) / 4)
  }
  await frames()
  const during = {
    dragged: widthOf(header(field)),
    name: widthOf(header('name')),
    note: widthOf(header('note'))
  }
  fire('pointerup', x + dx)
  await frames()
  return during
}

describe('C-132 Growing columns [own]', () => {
  test('divides the room by the weights; the other columns keep their width and the table is as wide as its container', async () => {
    const api = await mount({ tableProps: { hasSubtable: true } })
    // The utility cell first, then the columns: they keep their width.
    const kept = () => ({
      utility: widthOf('thead tr > :first-child'),
      id: widthOf(header('id'))
    })
    const before = kept()
    near(widthOf('.qt-table'), inner())
    const name = widthOf(header('name')) - 100
    const note = widthOf(header('note')) - 100
    near(note, 3 * name, 2)
    near(before.utility + before.id + 200 + name + note, inner(), 2)
    api.setWidth(1400)
    await frames()
    near(kept().utility, before.utility)
    near(kept().id, before.id)
    near(widthOf('.qt-table'), inner())
    // Drawn, never emitted.
    expect(api.columnUpdates).toBe(0)
    expect(api.resized).toEqual([])
  })

  test('a narrower container takes the shares back; without room the columns are at their base and the table scrolls', async () => {
    const api = await mount()
    api.setWidth(320)
    await frames()
    near(widthOf('.qt-table'), inner())
    expect(widthOf(header('name'))).toBeGreaterThan(100)
    api.setWidth(200)
    await frames()
    near(widthOf(header('name')), 100)
    near(widthOf(header('note')), 100)
    const scroller = el('.qt-table-responsive')
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
    api.setWidth(1000)
    await frames()
    near(widthOf('.qt-table'), inner())
  })

  test('a column stops at its maxWidth and the others divide what it leaves', async () => {
    await mount({
      columns: [
        { field: 'id', title: 'ID', width: '60px' },
        {
          field: 'name',
          title: 'Name',
          width: '100px',
          grow: 1,
          maxWidth: 150
        },
        { field: 'note', title: 'Note', width: '100px', grow: 1 }
      ]
    })
    near(widthOf(header('name')), 150)
    near(widthOf('.qt-table'), inner())
    expect(widthOf(header('note'))).toBeGreaterThan(500)
  })

  test('with autoWidth a growing column grows from its automatic width', async () => {
    await mount({
      columns: [
        { field: 'id', title: 'ID' },
        { field: 'name', title: 'Name' },
        { field: 'note', title: 'Note', grow: 1 }
      ],
      tableProps: { autoWidth: true }
    })
    await frames()
    near(widthOf('.qt-table'), inner())
    // The other columns stay at their automatic width.
    expect(widthOf(header('id'))).toBeLessThan(200)
    expect(widthOf(header('note'))).toBeGreaterThan(600)
  })

  test('a column that does not grow and has no width stops the shares, and a development build warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mount({
      columns: [
        { field: 'id', title: 'ID' },
        { field: 'name', title: 'Name', width: '100px', grow: 1 },
        { field: 'note', title: 'Note', width: '100px', grow: 3 }
      ]
    })
    expect(el(header('name')).style.width).toBe('100px')
    expect(el(header('note')).style.width).toBe('100px')
    const grow = warn.mock.calls.filter(([message]) =>
      String(message).includes('`grow`')
    )
    expect(grow).toHaveLength(1)
  })

  test('a drag on a column that does not grow: it follows the pointer and the growing columns take the difference', async () => {
    const api = await mount()
    const before = {
      id: widthOf(header('id')),
      name: widthOf(header('name')),
      note: widthOf(header('note'))
    }
    const during = await drag('id', 40)
    near(during.dragged, before.id + 40)
    near(during.name + during.note, before.name + before.note - 40, 2)
    // The width it is drawn at, as C-49 emits it.
    expect(api.resized).toEqual([
      { field: 'id', width: Math.round(before.id + 40) }
    ])
    // Written back: nothing moves on release.
    near(widthOf(header('id')), during.dragged)
    near(widthOf(header('name')), during.name, 2)
    near(widthOf('.qt-table'), inner())
  })

  test('a dragged growing column stays where it is left (D-05)', async () => {
    const api = await mount()
    const name = widthOf(header('name'))
    const during = await drag('name', 50)
    near(during.dragged, name + 50)
    expect(api.resized).toHaveLength(1)
    expect(api.resized[0].field).toBe('name')
    // The base that keeps it there: below the drawn width.
    expect(api.resized[0].width).toBeLessThan(during.dragged)
    near(widthOf(header('name')), during.dragged, 2)
    near(widthOf(header('note')), during.note, 2)
    near(widthOf('.qt-table'), inner())
  })

  test('a single growing column narrowed below the room fills it again; widened past it, it stays', async () => {
    const api = await mount({
      columns: [
        { field: 'id', title: 'ID', width: '60px' },
        { field: 'name', title: 'Name', width: '100px' },
        { field: 'note', title: 'Note', width: '100px', grow: 1 }
      ]
    })
    const note = widthOf(header('note'))
    await drag('note', -100)
    expect(api.resized).toHaveLength(1)
    near(widthOf(header('note')), note)
    await drag('note', 120)
    near(widthOf(header('note')), note + 120, 2)
    expect(api.resized.at(-1)!.width).toBe(Math.round(note + 120))
  })

  test('scrollBody: the body columns follow the header; header: false draws no share', async () => {
    await mount({ tableProps: { scrollBody: true } })
    await frames()
    const head = el('.qt-table-head')
    near(widthOf('.qt-table-head > .qt-table'), head.clientWidth)
    const cols = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.qt-table-body > .qt-table > colgroup > col'
      )
    )
    near(parseFloat(cols[2].style.width), widthOf(header('note')))
    cleanup()
    await mount({ tableProps: { header: false } })
    expect(document.querySelector('thead')).toBeNull()
    const noteCol = document.querySelectorAll<HTMLElement>('colgroup > col')[2]
    expect(noteCol.style.width).toBe('100px')
  })

  test('the read puts every style attribute back: only the header widths are written', async () => {
    const api = await mount()
    api.setWidth(800)
    await frames()
    expect(el('.qt-table').getAttribute('style')).toBeNull()
    expect(el(header('note')).getAttribute('style')).toMatch(/^width: \d+px;$/)
    expect(el(header('id')).getAttribute('style')).toBe('width: 60px;')
  })
})
