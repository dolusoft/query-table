import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import {
  defineComponent,
  h,
  ref,
  shallowRef,
  type PropType,
  type Slot,
  type VNode
} from 'vue'

import QueryTable, {
  type Column,
  type RowSelection,
  type TableQuery
} from '@dolusoft/query-table'

import {
  drawnIndexes,
  frames,
  scrollTo,
  useFixedLayout
} from '../../support/scroll-host'

// The row component in a real browser (ADR 0017, K311-12): which rows are
// drawn again and which cell slots are called again (C-106, C-107), and the
// DOM of the rows a change moves or changes (C-108). Each `cell-name` call is
// counted by row id. The C-106 and C-107 tests assert fewer calls than 3.10
// makes, so they are in `ADDED_AFTER_BASELINE`; the C-108 ones compare.

interface Row {
  id: number
  name: string
  age: number
  group: number
  isExpanded?: boolean
}

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Name ${i + 1}`,
    age: 20 + (i % 50),
    group: Math.floor(i / 13)
  }))

const columns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'number' }
]

const query: TableQuery = { page: 1, pageSize: 500, sort: null, filters: [] }

/** `cell-name` calls by row id since the last `calls.clear()`. */
const calls = new Map<number, number>()
const callsById = () => Object.fromEntries([...calls].sort(([a], [b]) => a - b))

interface HostApi {
  setRows: (rows: Row[]) => void
  rows: () => Row[]
  /** A new value the `cell-name` slot captures, not reactive: the page renders. */
  setLabel: (label: string) => void
  /** Advance the clock the `cell-name` slot of rows `1..clockRows` reads. */
  tick: () => void
  /** Make the `cell-name` content of row `tallRow` 120px tall. */
  setTall: (tall: boolean) => void
  box: () => HTMLElement
}

/**
 * A consumer component that forwards every slot it is given, as the Task
 * Monitor does with `<template v-for="(_, name) in $slots" #[name]>`: the
 * table gets new slot functions on each render of this component.
 */
const Forward = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () =>
      h(
        QueryTable as never,
        attrs,
        Object.fromEntries(
          Object.keys(slots).map(name => [
            name,
            (props: unknown) => (slots[name] as Slot)(props)
          ])
        )
      )
  }
})

const Host = defineComponent({
  props: {
    rows: { type: Array as PropType<Row[]>, required: true },
    tableProps: { type: Object, default: () => ({}) },
    /** Height of a scroll box around the table; `0` for none. */
    height: { type: Number, default: 0 },
    forward: { type: Boolean, default: false },
    duration: { type: String, default: '60s' },
    clockRows: { type: Number, default: 0 },
    tallRow: { type: Number, default: 0 },
    api: { type: Function as PropType<(api: HostApi) => void>, required: true }
  },
  setup(props) {
    const rows = shallowRef(props.rows)
    // The same columns on every render: new column objects draw every row.
    const layout = columns()
    const selection = shallowRef<RowSelection>({})
    const clock = ref(0)
    const tall = ref(false)
    const own = ref(0)
    const box = shallowRef<HTMLElement | null>(null)
    let label = 'A'
    props.api({
      setRows: next => {
        rows.value = next
      },
      rows: () => rows.value,
      setLabel: next => {
        label = next
        own.value++
      },
      tick: () => {
        clock.value++
      },
      setTall: next => {
        tall.value = next
      },
      box: () => box.value!
    })
    const setSelection = (next: RowSelection) => {
      selection.value = next
    }
    return () => {
      // The page renders when its own state changes.
      void own.value
      const captured = label
      const slots: Record<string, (props: never) => VNode> = {
        'cell-name': ({ row }: { row: Row }) => {
          calls.set(row.id, (calls.get(row.id) ?? 0) + 1)
          const time = row.id <= props.clockRows ? ` ${clock.value}` : ''
          const high = row.id === props.tallRow && tall.value
          return h(
            'span',
            {
              class: 'name-cell',
              style: high ? { display: 'block', height: '120px' } : undefined
            },
            `${row.name}|${captured}${time}`
          )
        },
        subtable: ({ row }: { row: Row }) => h('i', `detail ${row.id}`)
      }
      const tableProps = {
        columns: layout,
        rows: rows.value,
        query,
        totalRows: rows.value.length,
        rowKey: 'id',
        selection: selection.value,
        'onUpdate:selection': setSelection,
        // On the root: the skin sets the length there.
        style: { '--qt-flash-duration': props.duration },
        ...props.tableProps
      }
      return h(
        'div',
        {
          ref: box,
          class: 'render-box',
          style:
            props.height > 0
              ? { height: `${props.height}px`, overflowY: 'auto' }
              : undefined
        },
        [
          props.forward
            ? h(Forward, tableProps, slots)
            : h(QueryTable as never, tableProps, slots)
        ]
      )
    }
  }
})

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(() => {
  cleanup()
  calls.clear()
})

const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))

interface Options {
  count?: number
  height?: number
  forward?: boolean
  duration?: string
  clockRows?: number
  tallRow?: number
}

const mountHost = async (
  tableProps: Record<string, unknown> = {},
  options: Options = {}
) => {
  let api: HostApi | null = null
  await render(Host as never, {
    props: {
      rows: makeRows(options.count ?? 200),
      tableProps,
      height: options.height ?? 0,
      forward: options.forward ?? false,
      duration: options.duration ?? '60s',
      clockRows: options.clockRows ?? 0,
      tallRow: options.tallRow ?? 0,
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(3)
  calls.clear()
  return api!
}

/** The drawn data rows, by `data-row-index`. */
const rowElements = () =>
  new Map(
    [
      ...document.querySelectorAll<HTMLElement>(
        '.qt-table tbody > tr[data-row-index]'
      )
    ].map(tr => [Number(tr.dataset.rowIndex), tr])
  )

const rowAt = (index: number) =>
  document.querySelector<HTMLElement>(
    `.qt-table tbody > tr[data-row-index="${index}"]`
  )!

const cellAt = (index: number, field: string) =>
  rowAt(index).querySelector<HTMLElement>(`td[data-field="${field}"]`)!

/** The rows with the row of `id` given a new object and a new name. */
const renamed = (rows: Row[], id: number, name = 'Changed') =>
  rows.map(row => (row.id === id ? { ...row, name } : row))

/**
 * Replace the row at `index` with a new object: only that row's slot is
 * called, it shows the new name, and every drawn row keeps its element.
 */
const expectOneRowDrawn = async (api: HostApi, index: number) => {
  const before = rowElements()
  expect(before.has(index)).toBe(true)
  const id = api.rows()[index].id
  calls.clear()
  api.setRows(renamed(api.rows(), id))
  await frames(3)
  expect(callsById()).toEqual({ [id]: 1 })
  expect(cellAt(index, 'name').textContent).toBe('Changed|A')
  const after = rowElements()
  expect([...after.keys()]).toEqual([...before.keys()])
  for (const [at, tr] of before) {
    expect(after.get(at), `row ${at}`).toBe(tr)
  }
  return id
}

describe('C-106 A row is drawn again only for its own inputs [own]', () => {
  test('a replaced row object draws that row only', async () => {
    const api = await mountHost()
    await expectOneRowDrawn(api, 10)
  })

  test('a new array of the same row objects draws no row', async () => {
    const api = await mountHost()
    const before = rowElements()
    api.setRows([...api.rows()])
    await frames(3)
    expect(callsById()).toEqual({})
    expect(rowElements()).toEqual(before)
  })

  test('with virtual', async () => {
    const api = await mountHost({ virtual: { rowHeight: 37 } }, { height: 300 })
    await expectOneRowDrawn(api, drawnIndexes()[3])
  })

  test('with flash', async () => {
    const api = await mountHost({ flash: true, rowsUpdate: 'live' })
    await expectOneRowDrawn(api, 50)
    expect(cellAt(50, 'name').dataset.flash).toBe('a')
    // A second row: the first, still flashing, is not drawn again.
    await expectOneRowDrawn(api, 120)
  })

  test('with groupBy', async () => {
    const api = await mountHost({ groupBy: (row: Row) => row.group })
    await expectOneRowDrawn(api, 20)
  })

  test('with scrollBody', async () => {
    const api = await mountHost({ scrollBody: true })
    await expectOneRowDrawn(api, 10)
  })

  test('through a component that forwards its slots', async () => {
    const api = await mountHost({}, { forward: true })
    await expectOneRowDrawn(api, 10)
  })

  test('through a forwarding component, with virtual and flash, a row mounted by a scroll after a flash began', async () => {
    const api = await mountHost(
      {
        virtual: { rowHeight: 37 },
        flash: true,
        rowsUpdate: 'live',
        groupBy: (row: Row) => row.group
      },
      { height: 300, forward: true }
    )
    await expectOneRowDrawn(api, 0)
    await scrollTo(api.box(), 1200)
    const drawn = drawnIndexes()
    expect(drawn).not.toContain(0)
    const index = drawn[Math.floor(drawn.length / 2)]
    await expectOneRowDrawn(api, index)
    expect(cellAt(index, 'name').dataset.flash).toBe('a')
  })

  test('a flash that ends draws its row only, which loses its marks and its elapsed time', async () => {
    const api = await mountHost(
      { virtual: { rowHeight: 37 }, flash: true, rowsUpdate: 'live' },
      { height: 300, duration: '700ms' }
    )
    const start = performance.now()
    api.setRows(renamed(api.rows(), 1))
    await frames(2)
    expect(cellAt(0, 'name').dataset.flash).toBe('a')
    await sleep(200)
    // Out of the window and back: the row is mounted and bound again.
    await scrollTo(api.box(), 6000)
    expect(drawnIndexes()).not.toContain(0)
    await scrollTo(api.box(), 0)
    const cell = cellAt(0, 'name')
    expect(cell.dataset.flash).toBe('a')
    expect(
      parseFloat(cell.style.getPropertyValue('--qt-flash-elapsed'))
    ).toBeGreaterThan(100)
    calls.clear()
    await sleep(700 + 150 - (performance.now() - start))
    await frames(2)
    expect(callsById()).toEqual({ 1: 1 })
    expect(cellAt(0, 'name')).toBe(cell)
    expect(cell.dataset.flash).toBeUndefined()
    expect(cell.style.getPropertyValue('--qt-flash-elapsed')).toBe('')
    expect(rowAt(0).dataset.flash).toBeUndefined()
  })

  test('a flash restarts on a row that was skipped while it flashed', async () => {
    const api = await mountHost({ flash: true, rowsUpdate: 'live' })
    api.setRows(renamed(api.rows(), 3, 'First'))
    await frames(2)
    await expectOneRowDrawn(api, 7)
    const skipped = cellAt(2, 'name')
    expect(skipped.dataset.flash).toBe('a')
    expect(cellAt(7, 'name').dataset.flash).toBe('a')
    await sleep(100)
    calls.clear()
    api.setRows(renamed(api.rows(), 3, 'Second'))
    await frames(2)
    expect(callsById()).toEqual({ 3: 1 })
    expect(cellAt(2, 'name')).toBe(skipped)
    expect(skipped.dataset.flash).toBe('b')
    expect(cellAt(7, 'name').dataset.flash).toBe('a')
  })

  test('a slot that makes its row taller draws that row only, with virtual', async () => {
    const api = await mountHost({ virtual: true }, { height: 300, tallRow: 2 })
    api.setTall(true)
    await frames(4)
    expect(callsById()).toEqual({ 2: 1 })
  })
})

describe('C-107 A cell slot is called again with its row only [own]', () => {
  test('through a forwarding component, a new closure is called when its row is drawn again, not before', async () => {
    const api = await mountHost({}, { forward: true })
    api.setLabel('B')
    await frames(3)
    expect(callsById()).toEqual({})
    expect(cellAt(4, 'name').textContent).toBe('Name 5|A')
    await userEvent.click(rowAt(4).querySelector('.qt-select-row')!)
    await frames(3)
    expect(callsById()).toEqual({ 5: 1 })
    expect(cellAt(4, 'name').textContent).toBe('Name 5|B')
    expect(cellAt(5, 'name').textContent).toBe('Name 6|A')
  })

  test('a reactive value a slot reads draws only the rows whose slot read it', async () => {
    const api = await mountHost({}, { count: 100, clockRows: 5 })
    for (let i = 1; i <= 3; i++) {
      api.tick()
      await frames(2)
    }
    expect(callsById()).toEqual({ 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 })
    expect(cellAt(0, 'name').textContent).toBe('Name 1|A 3')
    expect(cellAt(5, 'name').textContent).toBe('Name 6|A')
  })
})

describe('C-108 Row component: the DOM of rows a change moves [own]', () => {
  test('a row whose new group key splits its group moves the aria-rowindex of the rows below', async () => {
    const api = await mountHost(
      { virtual: { rowHeight: 37 }, groupBy: (row: Row) => row.group },
      { height: 700 }
    )
    const aria = (index: number) => Number(rowAt(index).ariaRowIndex)
    const before = [4, 5, 6, 8].map(aria)
    api.setRows(
      api.rows().map(row => (row.id === 6 ? { ...row, group: 99 } : row))
    )
    await frames(3)
    expect([4, 5, 6, 8].map(aria)).toEqual([
      before[0],
      before[1] + 1,
      before[2] + 2,
      before[3] + 2
    ])
    expect(
      document.querySelectorAll('.qt-table tbody > tr.qt-group-row')
    ).toHaveLength(Math.ceil(drawnIndexes().length / 13) + 2)
  })

  test('a row whose isExpanded seed changes opens its subtable', async () => {
    const api = await mountHost({ hasSubtable: true }, { count: 20 })
    const before = rowElements()
    api.setRows(
      api.rows().map(row => (row.id === 3 ? { ...row, isExpanded: true } : row))
    )
    await frames(3)
    const tr = rowAt(2)
    expect(tr).toBe(before.get(2))
    expect(tr.dataset.expanded).toBe('')
    expect(tr.querySelector('.qt-expand')!.getAttribute('aria-expanded')).toBe(
      'true'
    )
    const next = tr.nextElementSibling as HTMLElement
    expect(next.classList.contains('qt-subtable-row')).toBe(true)
    expect(next.textContent).toBe('detail 3')
  })

  test('a slot that makes its row taller moves the window, with virtual', async () => {
    const api = await mountHost({ virtual: true }, { height: 300, tallRow: 2 })
    const box = api.box()
    const height = box.scrollHeight
    const rowHeight = rowAt(1).getBoundingClientRect().height
    api.setTall(true)
    await frames(4)
    expect(rowAt(1).getBoundingClientRect().height).toBeGreaterThan(120)
    expect(box.scrollHeight - height).toBeGreaterThan(120 - rowHeight - 5)
  })
})
