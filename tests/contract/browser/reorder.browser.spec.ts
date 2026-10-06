import { afterEach, describe, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup } from 'vitest-browser-vue'
import { defineComponent, h, shallowRef } from 'vue'

import QueryTable, {
  type Column,
  type ColumnChangeReason
} from '@dolusoft/query-table'

import { renderColumnsTable } from '../../support/columns-host'
import { makeQuery, rows } from '../../support/fixtures'

// C-73 in a real browser, with the playground skin: the reorder handle drags
// a column within its region (preview by attributes only, one event on
// release) and moves it by key, and the focus stays on the moved handle.

afterEach(() => {
  cleanup()
})

const frames = async (count = 2) => {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve))
  }
}

/** The header cells of a table, never a nested table's. */
const headerCells = (table = document.querySelector('table.qt-table')!) => [
  ...table.querySelectorAll<HTMLElement>(':scope > thead > tr > th[data-field]')
]
const headerOrder = (table?: Element) =>
  headerCells(table ?? undefined).map(th => th.dataset.field)
const headerOf = (field: string, table?: Element) =>
  headerCells(table ?? undefined).find(th => th.dataset.field === field)!
const handleOf = (field: string, table?: Element) =>
  headerOf(field, table).querySelector<HTMLElement>(
    ':scope > .qt-reorder-handle'
  )!
const fieldsOf = (columns: Column[]) => columns.map(column => column.field)

const pointer = (x: number, y: number) => ({
  bubbles: true,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: 'mouse',
  isPrimary: true,
  button: 0,
  buttons: 1
})

/** Presses a handle without releasing it. */
const press = async (handle: Element) => {
  const box = handle.getBoundingClientRect()
  handle.dispatchEvent(
    new PointerEvent(
      'pointerdown',
      pointer(box.left + box.width / 2, box.top + box.height / 2)
    )
  )
  await frames()
}

/** Moves the pressed pointer over a half of a cell; the handle has the capture. */
const moveOver = async (
  handle: Element,
  cell: Element,
  half: 'before' | 'after'
) => {
  const box = cell.getBoundingClientRect()
  handle.dispatchEvent(
    new PointerEvent(
      'pointermove',
      pointer(
        box.left + box.width * (half === 'before' ? 0.25 : 0.75),
        box.top + box.height / 2
      )
    )
  )
  await frames()
}

const release = async (handle: Element, type = 'pointerup') => {
  handle.dispatchEvent(new PointerEvent(type, pointer(0, 0)))
  await frames()
}

const dragMarks = () => ({
  dragging: [...document.querySelectorAll('th[data-dragging]')].map(
    th => (th as HTMLElement).dataset.field
  ),
  drop: [...document.querySelectorAll('th[data-drop]')].map(
    th =>
      `${(th as HTMLElement).dataset.field}:${(th as HTMLElement).dataset.drop}`
  )
})

describe('C-73 Reorder handle [tanstack] [own]', () => {
  test('a real pointer drag places the column where it is released', async () => {
    const { changes, updates } = await renderColumnsTable({ reorderable: true })
    await userEvent.dragAndDrop(
      page.elementLocator(handleOf('id')),
      page.elementLocator(headerOf('age')),
      { targetPosition: { x: headerOf('age').offsetWidth - 4, y: 8 } }
    )
    await frames()
    expect(changes.map(([next, reason]) => [fieldsOf(next), reason])).toEqual([
      [['name', 'age', 'id', 'joined'], 'order']
    ])
    expect(headerOrder()).toEqual(['name', 'age', 'id', 'joined'])
    expect(dragMarks()).toEqual({ dragging: [], drop: [] })
    expect(updates).toEqual([])
  })

  test('dragging previews with attributes only and emits one update on release', async () => {
    const { changes, updates, columns } = await renderColumnsTable({
      reorderable: true
    })
    const handle = handleOf('id')
    await press(handle)
    expect(document.activeElement).toBe(handle)
    await moveOver(handle, headerOf('age'), 'after')
    expect(dragMarks()).toEqual({ dragging: ['id'], drop: ['age:after'] })
    await moveOver(handle, headerOf('name'), 'before')
    expect(dragMarks()).toEqual({ dragging: ['id'], drop: ['name:before'] })
    await moveOver(handle, headerOf('joined'), 'after')
    expect(dragMarks()).toEqual({ dragging: ['id'], drop: ['joined:after'] })
    // Nothing is emitted and nothing moves while dragging.
    expect(changes).toEqual([])
    expect(headerOrder()).toEqual(['id', 'name', 'age', 'joined'])

    await release(handle)
    expect(changes).toHaveLength(1)
    expect(changes[0][1]).toBe('order')
    expect(fieldsOf(columns())).toEqual(['name', 'age', 'joined', 'id'])
    expect(headerOrder()).toEqual(['name', 'age', 'joined', 'id'])
    expect(dragMarks()).toEqual({ dragging: [], drop: [] })
    expect(updates).toEqual([])
  })

  test('releasing where the order stays emits nothing', async () => {
    const { changes } = await renderColumnsTable({ reorderable: true })
    const handle = handleOf('name')
    // On itself: no drop target.
    await press(handle)
    await moveOver(handle, headerOf('name'), 'after')
    expect(dragMarks()).toEqual({ dragging: ['name'], drop: [] })
    await release(handle)
    // On the half of a neighbour that is already its place.
    await press(handle)
    await moveOver(handle, headerOf('age'), 'before')
    expect(dragMarks().drop).toEqual(['age:before'])
    await release(handle)
    await press(handle)
    await moveOver(handle, headerOf('id'), 'after')
    await release(handle)
    expect(changes).toEqual([])
    expect(headerOrder()).toEqual(['id', 'name', 'age', 'joined'])
  })

  test.each(['Escape', 'pointercancel', 'lostpointercapture'])(
    '%s ends the drag without an event',
    async how => {
      const { changes } = await renderColumnsTable({ reorderable: true })
      const handle = handleOf('id')
      await press(handle)
      await moveOver(handle, headerOf('age'), 'after')
      expect(dragMarks().drop).toEqual(['age:after'])
      if (how === 'Escape') {
        await userEvent.keyboard('{Escape}')
        await frames()
      } else {
        await release(handle, how)
      }
      expect(dragMarks()).toEqual({ dragging: [], drop: [] })
      // A release after the end places nothing.
      await release(handle)
      expect(changes).toEqual([])
      expect(headerOrder()).toEqual(['id', 'name', 'age', 'joined'])
    }
  )

  test('keys move within the region; Home and End go to its ends; the edge does nothing', async () => {
    const { changes, updates, columns } = await renderColumnsTable({
      reorderable: true
    })
    handleOf('name').focus()
    await userEvent.keyboard('{ArrowRight}')
    await frames()
    expect(fieldsOf(columns())).toEqual(['id', 'age', 'name', 'joined'])
    await userEvent.keyboard('{End}')
    await frames()
    expect(fieldsOf(columns())).toEqual(['id', 'age', 'joined', 'name'])
    // At the edge: nothing.
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard('{End}')
    await frames()
    expect(changes).toHaveLength(2)
    await userEvent.keyboard('{Home}')
    await frames()
    expect(fieldsOf(columns())).toEqual(['name', 'id', 'age', 'joined'])
    await userEvent.keyboard('{ArrowLeft}')
    await userEvent.keyboard('{Home}')
    await frames()
    expect(changes).toHaveLength(3)
    await userEvent.keyboard('{ArrowRight}')
    await frames()
    expect(fieldsOf(columns())).toEqual(['id', 'name', 'age', 'joined'])
    expect(changes.map(([, reason]) => reason)).toEqual([
      'order',
      'order',
      'order',
      'order'
    ])
    expect(headerOrder()).toEqual(['id', 'name', 'age', 'joined'])
    expect(updates).toEqual([])
  })

  test('focus stays on the moved column handle after the write-back', async () => {
    const { changes } = await renderColumnsTable({ reorderable: true })
    handleOf('id').focus()
    for (const expected of [
      ['name', 'id', 'age', 'joined'],
      ['name', 'age', 'id', 'joined'],
      ['name', 'age', 'joined', 'id']
    ]) {
      await userEvent.keyboard('{ArrowRight}')
      await frames()
      expect(headerOrder()).toEqual(expected)
      expect(document.activeElement).toBe(handleOf('id'))
    }
    // And back, where Vue moves the focused cell itself.
    await userEvent.keyboard('{Home}')
    await frames()
    expect(headerOrder()).toEqual(['id', 'name', 'age', 'joined'])
    expect(document.activeElement).toBe(handleOf('id'))
    expect(changes).toHaveLength(4)
  })

  test('a consumer that does not write back sees the old order and keeps focus', async () => {
    const { changes } = await renderColumnsTable(
      { reorderable: true },
      { writeBack: false }
    )
    const handle = handleOf('name')
    handle.focus()
    await userEvent.keyboard('{ArrowRight}')
    await frames()
    expect(changes).toHaveLength(1)
    expect(fieldsOf(changes[0][0])).toEqual(['id', 'age', 'name', 'joined'])
    expect(headerOrder()).toEqual(['id', 'name', 'age', 'joined'])
    expect(document.activeElement).toBe(handle)
    // A drag the same way.
    await press(handle)
    await moveOver(handle, headerOf('joined'), 'after')
    await release(handle)
    expect(changes).toHaveLength(2)
    expect(headerOrder()).toEqual(['id', 'name', 'age', 'joined'])
  })

  test('a later outside change does not take the focus back once it left', async () => {
    const { setColumns, columns } = await renderColumnsTable(
      { reorderable: true },
      { writeBack: false }
    )
    handleOf('name').focus()
    await userEvent.keyboard('{ArrowRight}')
    await frames()
    const input =
      headerOf('age').querySelector<HTMLElement>('.qt-filter-input')!
    input.focus()
    // Removing a column moves no header cell, so nothing else drops focus.
    setColumns(columns().filter(column => column.field !== 'joined'))
    await frames()
    expect(headerOrder()).toEqual(['id', 'name', 'age'])
    expect(document.activeElement).toBe(input)
  })

  test('dragging over another region shows no drop target', async () => {
    const { changes } = await renderColumnsTable({
      reorderable: true,
      columns: [
        { field: 'id', title: 'ID', type: 'number', pinned: 'left' },
        { field: 'name', title: 'Name' },
        { field: 'age', title: 'Age', type: 'number' },
        { field: 'joined', title: 'Joined', type: 'date', pinned: 'right' }
      ]
    })
    const handle = handleOf('id')
    await press(handle)
    await moveOver(handle, headerOf('name'), 'after')
    expect(dragMarks()).toEqual({ dragging: ['id'], drop: [] })
    await moveOver(handle, headerOf('joined'), 'before')
    expect(dragMarks().drop).toEqual([])
    await release(handle)
    // Keys stay in the region too: `age` is the last of the middle.
    handleOf('age').focus()
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard('{End}')
    await frames()
    expect(changes).toEqual([])
    expect(headerOrder()).toEqual(['id', 'name', 'age', 'joined'])
  })

  test('columns changed from outside end the drag without an event', async () => {
    const { changes, setColumns, columns } = await renderColumnsTable({
      reorderable: true
    })
    const handle = handleOf('id')
    await press(handle)
    await moveOver(handle, headerOf('age'), 'after')
    expect(dragMarks().drop).toEqual(['age:after'])
    setColumns(columns().filter(column => column.field !== 'age'))
    await frames()
    expect(dragMarks()).toEqual({ dragging: [], drop: [] })
    await release(handle)
    expect(changes).toEqual([])
    expect(headerOrder()).toEqual(['id', 'name', 'joined'])
  })

  test('a nested table keeps its own handles', async () => {
    const inner: Array<[Column[], ColumnChangeReason]> = []
    const Inner = defineComponent({
      setup() {
        const current = shallowRef<Column[]>([
          { field: 'id', title: 'ID', type: 'number' },
          { field: 'name', title: 'Name' },
          { field: 'age', title: 'Age', type: 'number' }
        ])
        return () =>
          h(QueryTable as never, {
            class: 'inner',
            reorderable: true,
            rows: rows(2),
            totalRows: 2,
            query: makeQuery(),
            columns: current.value,
            'onUpdate:columns': (
              next: Column[],
              reason: ColumnChangeReason
            ) => {
              inner.push([next, reason])
              current.value = next
            }
          })
      }
    })
    const { changes } = await renderColumnsTable(
      {
        reorderable: true,
        hasSubtable: true,
        rows: rows().map((row, i) => ({ ...row, isExpanded: i === 0 }))
      },
      { slots: { subtable: () => [h(Inner)] } }
    )
    const [outer, nested] = [...document.querySelectorAll('table.qt-table')]
    expect(nested).toBeDefined()

    handleOf('id', outer).focus()
    await userEvent.keyboard('{ArrowRight}')
    await frames()
    expect(changes).toHaveLength(1)
    expect(inner).toEqual([])
    expect(headerOrder(outer)).toEqual(['name', 'id', 'age', 'joined'])
    expect(headerOrder(nested)).toEqual(['id', 'name', 'age'])
    expect(document.activeElement).toBe(handleOf('id', outer))

    handleOf('id', nested).focus()
    await userEvent.keyboard('{End}')
    await frames()
    expect(changes).toHaveLength(1)
    expect(inner).toHaveLength(1)
    expect(headerOrder(nested)).toEqual(['name', 'age', 'id'])
    expect(document.activeElement).toBe(handleOf('id', nested))

    // The outer drag never marks a cell of the nested header.
    const handle = handleOf('age', outer)
    await press(handle)
    await moveOver(handle, headerOf('name', nested), 'before')
    expect(nested.querySelector('th[data-drop], th[data-dragging]')).toBeNull()
    await release(handle, 'pointercancel')
    expect(inner).toHaveLength(1)
  })

  test('a field with a dot keeps focus', async () => {
    await renderColumnsTable({
      reorderable: true,
      columns: [
        { field: 'id', title: 'ID', type: 'number' },
        { field: 'user.name', title: 'User' },
        { field: 'age', title: 'Age', type: 'number' }
      ]
    })
    handleOf('user.name').focus()
    await userEvent.keyboard('{Home}')
    await frames()
    expect(headerOrder()).toEqual(['user.name', 'id', 'age'])
    expect(document.activeElement).toBe(handleOf('user.name'))
  })

  test('the handle never sorts', async () => {
    const { updates, changes } = await renderColumnsTable({
      reorderable: true,
      sortable: true
    })
    const handle = handleOf('name')
    await userEvent.click(handle)
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    await frames()
    expect(updates).toEqual([])
    expect(changes).toEqual([])
    expect(headerOf('name').dataset.sort).toBeUndefined()
  })

  test('the reorder handle comes first and the resize handle last', async () => {
    await renderColumnsTable({
      reorderable: true,
      resizable: true,
      columns: [
        { field: 'id', title: 'ID', type: 'number' },
        { field: 'name', title: 'Name', reorderable: false },
        { field: 'age', title: 'Age', type: 'number' }
      ]
    })
    for (const field of ['id', 'age']) {
      const th = headerOf(field)
      expect(
        th.firstElementChild?.classList.contains('qt-reorder-handle')
      ).toBe(true)
      expect(th.lastElementChild?.classList.contains('qt-resize-handle')).toBe(
        true
      )
      const handle = handleOf(field)
      expect(handle.getAttribute('type')).toBe('button')
      expect(handle.getAttribute('aria-keyshortcuts')).toBe(
        'ArrowLeft ArrowRight Home End'
      )
    }
    expect(handleOf('id').getAttribute('aria-label')).toBe('Move ID')
    expect(headerOf('name').querySelector('.qt-reorder-handle')).toBeNull()
  })
})
