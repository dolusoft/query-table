import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import { defineComponent, h, shallowRef, type Slots } from 'vue'

import QueryTable, {
  type Column,
  type RowPinning,
  type RowSelection,
  type TableQuery
} from '@dolusoft/query-table'

import { frames, useFixedLayout } from '../../support/scroll-host'

// C-108: the body's markup is the one of 3.10 for every state and every
// transition drawn here. The markup of `tbody` is compared with a snapshot
// taken from the 3.10.0 build (`__snapshots__/row-markup-*.html`), so this
// file must pass on both builds and is not in `ADDED_AFTER_BASELINE`.
//
// Normalised: a comment placeholder is `<!---->` (a development build writes
// `<!--v-if-->`), a template comment of the development build is dropped,
// and a measured length (`12.5px`, `900ms`) is `#px` or `#ms`, so the
// snapshot does not depend on the fonts of the machine.

interface Row {
  id: number
  name: string
  age: number
  group: string
  isExpanded?: boolean
}

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Name ${i + 1}`,
    age: 20 + (i % 7),
    group: i < Math.ceil(count / 2) ? 'first' : 'second'
  }))

const baseColumns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number', pinned: 'left' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'number' },
  { field: 'group', title: 'Group', pinned: 'right' }
]

const query: TableQuery = { page: 1, pageSize: 500, sort: null, filters: [] }

interface HostApi {
  setRows: (rows: Row[]) => void
  setColumns: (columns: Column[]) => void
  setSlots: (names: string[]) => void
  rows: () => Row[]
}

const cellSlot =
  (field: string) =>
  ({ cellValue, rowIndex }: { cellValue: unknown; rowIndex: number }) =>
    h('b', { class: `slot-${field}` }, `${String(cellValue)}@${rowIndex}`)

/** A consumer that can change its rows, columns and cell slots. */
const Host = defineComponent({
  props: {
    rows: { type: Array, required: true },
    tableProps: { type: Object, default: () => ({}) },
    slotNames: { type: Array, default: () => [] },
    /** Height of a scroll box around the table; `0` for none. */
    height: { type: Number, default: 0 },
    api: { type: Function, required: true }
  },
  setup(props) {
    const rows = shallowRef(props.rows as Row[])
    const columns = shallowRef(baseColumns())
    const names = shallowRef(props.slotNames as string[])
    const selection = shallowRef<RowSelection>(
      (props.tableProps.selection as RowSelection | undefined) ?? {}
    )
    const pinning = shallowRef<RowPinning | undefined>(
      props.tableProps.rowPinning as RowPinning | undefined
    )
    ;(props.api as (api: HostApi) => void)({
      setRows: next => {
        rows.value = next
      },
      setColumns: next => {
        columns.value = next
      },
      setSlots: next => {
        names.value = next
      },
      rows: () => rows.value
    })
    return () => {
      const slots: Slots = {
        subtable: ({ row }: { row: Row }) => h('i', `detail ${row.id}`)
      }
      for (const name of names.value) {
        slots[name] = cellSlot(name.slice('cell-'.length)) as never
      }
      const table = h(
        QueryTable as never,
        {
          rowKey: 'id',
          ...props.tableProps,
          columns: columns.value,
          rows: rows.value,
          query,
          selection: props.tableProps.selection ? selection.value : undefined,
          'onUpdate:selection': (next: RowSelection) => {
            selection.value = next
          },
          rowPinning: pinning.value,
          'onUpdate:rowPinning': (next: RowPinning) => {
            pinning.value = next
          }
        },
        slots
      )
      return h(
        'div',
        {
          class: 'markup-box',
          style: {
            '--qt-flash-duration': '60s',
            ...(props.height > 0
              ? { height: `${props.height}px`, overflowY: 'auto' }
              : {})
          }
        },
        [table]
      )
    }
  }
})

const normalised = (html: string) =>
  html
    .replace(/<!--([\s\S]*?)-->/g, (_, text: string) =>
      text === '' || text === 'v-if' ? '<!---->' : ''
    )
    .replace(/-?\d+(\.\d+)?px/g, '#px')
    .replace(/\d+ms/g, '#ms')
    .replace(/>\s+</g, '><')
    .replace(/></g, '>\n<')

/** The markup of every `tbody` of the table, normalised. */
const bodies = () =>
  [...document.querySelectorAll('.markup-box tbody')]
    .map(body => normalised(body.innerHTML))
    .join('\n<!-- next tbody -->\n')

let api: HostApi
const mount = async (
  props: {
    rows?: Row[]
    tableProps?: Record<string, unknown>
    slotNames?: string[]
    height?: number
  } = {}
) => {
  await render(Host as never, {
    props: {
      rows: props.rows ?? makeRows(4),
      tableProps: props.tableProps ?? {},
      slotNames: props.slotNames ?? [],
      height: props.height ?? 0,
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(3)
}

/** The table of most states: every utility, a kind and both pin sides. */
const fullProps = () => ({
  hasSubtable: true,
  hasRightPanel: true,
  selection: { '2': true },
  rowExpandable: (row: Row) => row.id !== 3,
  rowKind: (row: Row) => (row.id === 2 ? 'warning' : null)
})

const fullRows = () =>
  makeRows(4).map(row => (row.id === 1 ? { ...row, isExpanded: true } : row))

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(() => {
  cleanup()
})

describe('C-108 Row component and DOM contract of 3.11 [own]', () => {
  test('the body markup of each state is the one of 3.10', async () => {
    const states: string[] = []
    const take = (name: string) => {
      states.push(`<!-- state: ${name} -->\n${bodies()}`)
    }

    await mount()
    take('text cells')
    cleanup()

    await mount({
      rows: fullRows(),
      tableProps: fullProps(),
      slotNames: ['cell-name']
    })
    take('selection, subtable open and closed, a row that cannot expand, right panel, kind, pinned columns, a cell slot')
    cleanup()

    await mount({
      tableProps: { flash: true, rowsUpdate: 'live' },
      slotNames: ['cell-name']
    })
    api.setRows([
      { id: 99, name: 'New', age: 1, group: 'first' },
      ...api.rows().map(row => (row.id === 2 ? { ...row, age: 50 } : row))
    ])
    await frames(2)
    take('flash with a marked row and a marked cell')
    cleanup()

    await mount({
      rows: makeRows(200),
      tableProps: { virtual: { rowHeight: 30 }, hasSubtable: true },
      height: 300
    })
    take('virtual')
    cleanup()

    await mount({
      rows: makeRows(6),
      tableProps: { groupBy: (row: Row) => row.group },
      slotNames: ['cell-age']
    })
    take('groupBy')
    cleanup()

    await mount({
      rows: fullRows(),
      tableProps: { ...fullProps(), scrollBody: true },
      slotNames: ['cell-name']
    })
    take('scrollBody')
    cleanup()

    await mount({
      rows: makeRows(5),
      tableProps: { rowPinning: { top: ['3'], bottom: ['1'] } },
      slotNames: ['cell-name']
    })
    take('pinned rows')

    await expect(states.join('\n')).toMatchFileSnapshot(
      './__snapshots__/row-markup-states.html'
    )
  })

  test('the body markup after each transition is the one of 3.10', async () => {
    const steps: string[] = []
    const take = (name: string) => {
      steps.push(`<!-- after: ${name} -->\n${bodies()}`)
    }
    await mount({
      rows: fullRows(),
      tableProps: fullProps(),
      slotNames: ['cell-name']
    })
    take('mount')

    api.setSlots(['cell-name', 'cell-age'])
    await frames(2)
    take('a cell slot added')
    api.setSlots(['cell-name'])
    await frames(2)
    take('a cell slot removed')

    api.setColumns(
      baseColumns().map(column =>
        column.field === 'name' ? { ...column, hide: true } : column
      )
    )
    await frames(2)
    take('a column hidden')
    api.setColumns(baseColumns())
    await frames(2)
    take('a column shown')

    const [id, name, age, group] = baseColumns()
    api.setColumns([id, age, name, group])
    await frames(2)
    take('a column moved')

    api.setRows(
      api
        .rows()
        .map(row => (row.id === 2 ? { ...row, name: 'Replaced', age: 77 } : row))
    )
    await frames(2)
    take('a row replaced')

    const expand = document.querySelector<HTMLElement>(
      '.markup-box tbody > tr[data-row-index="1"] .qt-expand'
    )!
    await userEvent.click(expand)
    await frames(2)
    take('a row expanded')

    const select = document.querySelector<HTMLElement>(
      '.markup-box tbody > tr[data-row-index="3"] .qt-select-row'
    )!
    await userEvent.click(select)
    await frames(2)
    take('a row selected')

    await expect(steps.join('\n')).toMatchFileSnapshot(
      './__snapshots__/row-markup-transitions.html'
    )
  })

  test('the table adds no listener to a row or a cell', async () => {
    expect(await listenersOnRowsAndCells({})).toEqual([])
  })

  // 3.10 adds a `vnode-before-mount` and a `vnode-updated` listener to each
  // drawn row when `flash` turns on after the mount: Vue patches the row's
  // vnode hooks as DOM listeners once they are dynamic props. 3.11 keeps
  // the hooks out of the patched props. Not compared with 3.10
  // (`ADDED_AFTER_BASELINE`).
  test('with flash on the table adds no listener to a row or a cell', async () => {
    expect(await listenersOnRowsAndCells({ flash: true })).toEqual([])
  })
})

/**
 * The listeners added to a `tr` or a `td` while a table mounts and one of
 * its rows is replaced. The controls inside the cells have their handlers;
 * no row or cell does (C-28, C-108).
 */
async function listenersOnRowsAndCells(extra: Record<string, unknown>) {
  const targets: string[] = []
  const original = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    ...args: Parameters<EventTarget['addEventListener']>
  ) {
    // Header cells are `th`; a `tr` or a `td` is a body or footer part.
    if (this instanceof Element && /^(TR|TD)$/.test(this.tagName)) {
      targets.push(`${this.tagName} ${args[0]}`)
    }
    original.apply(this, args)
  }
  try {
    await mount({
      rows: makeRows(20),
      tableProps: { ...fullProps(), ...extra },
      slotNames: ['cell-name']
    })
    api.setRows(
      api.rows().map(row => (row.id === 4 ? { ...row, age: 90 } : row))
    )
    await frames(2)
  } finally {
    EventTarget.prototype.addEventListener = original
  }
  expect(
    document.querySelectorAll('.markup-box tbody td').length
  ).toBeGreaterThan(0)
  return targets
}
