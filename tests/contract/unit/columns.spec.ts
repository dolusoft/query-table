import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, h, toRaw } from 'vue'

import {
  type Column,
  type ColumnChangeReason,
  type ColumnControl,
  type FilterMenuSlotProps,
  type HeaderSlotProps,
  useQueryTable
} from '@dolusoft/query-table'

import {
  deepFreeze,
  flush,
  makeColumns,
  makeQuery,
  mountTable,
  type Mounted
} from '../../support/mount-table'

// C-67 to C-70 (ADR 0007): the consumer's `columns` owns the layout. The
// table projects it into TanStack's visibility, order and pinning slices and
// hands every change back as one `update:columns(columns, reason)`.

type ColumnsEvent = [Column[], ColumnChangeReason]

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

/** Mounts with a `header-<field>` slot per column that hands its `control` out. */
const mountLayout = (
  columns: Column[],
  {
    writeBack = true,
    props = {}
  }: { writeBack?: boolean; props?: Record<string, unknown> } = {}
) => {
  const controls = new Map<string, ColumnControl>()
  const changes: ColumnsEvent[] = []
  const slots = Object.fromEntries(
    columns.map(column => [
      `header-${column.field}`,
      (p: HeaderSlotProps) => {
        controls.set(p.column.field, p.control)
        return h('span', p.column.title ?? p.column.field)
      }
    ])
  )
  const m: Mounted = mountTable(
    {
      columns,
      'onUpdate:columns': (next: Column[], reason: ColumnChangeReason) => {
        changes.push([next, reason])
        if (writeBack) {
          void m.wrapper.setProps({ columns: next })
        }
      },
      ...props
    },
    { slots }
  )
  mounted = m
  const headerFields = () =>
    m.wrapper
      .findAll('thead th[data-field]')
      .map(th => th.attributes('data-field'))
  return {
    m,
    changes,
    control: (field: string) => controls.get(field)!,
    headerFields
  }
}

describe('C-67 Column visibility [tanstack] [own]', () => {
  it('hide() emits one update:columns with the column hidden and nothing else new', async () => {
    const columns = makeColumns()
    const { m, control, changes, headerFields } = mountLayout(columns)
    control('age').hide()
    await flush()
    expect(changes).toHaveLength(1)
    const [next, reason] = changes[0]
    expect(reason).toBe('visibility')
    expect(next).not.toBe(columns)
    expect(next[2]).toEqual({ ...columns[2], hide: true })
    // The test mount passes props through `reactive()`, as a `ref` of the
    // consumer does: unchanged columns are the same objects behind it.
    next.forEach((column, i) => {
      if (i !== 2) {
        expect(toRaw(column)).toBe(columns[i])
      }
    })
    expect(headerFields()).toEqual(['id', 'name', 'joined'])
    expect(m.events).toEqual([])
  })

  it('keeps the typed text of a hidden column and shows it when the column comes back', async () => {
    const columns = makeColumns()
    const { m, control } = mountLayout(columns, {
      props: { filterable: true, filterDebounce: 5000 }
    })
    await m.wrapper.find('th[data-field="name"] input').setValue('bo')
    control('name').hide()
    await flush()
    expect(m.wrapper.find('th[data-field="name"]').exists()).toBe(false)
    await m.wrapper.setProps({ columns })
    await flush()
    expect(
      (
        m.wrapper.find('th[data-field="name"] input')
          .element as HTMLInputElement
      ).value
    ).toBe('bo')
    expect(m.events).toEqual([])
  })
})

describe('C-68 Columns are controlled [tanstack] [own]', () => {
  it('works on frozen columns and never writes to them', async () => {
    const columns = deepFreeze(makeColumns())
    const before = structuredClone(columns)
    const { control, changes } = mountLayout(columns, { writeBack: false })
    control('name').pin('right')
    control('age').hide()
    control('id').move('right')
    await flush()
    expect(changes.map(([, reason]) => reason)).toEqual([
      'pin',
      'visibility',
      'order'
    ])
    expect(columns).toEqual(before)
  })

  it('keeps extra fields and the identity of unchanged columns', async () => {
    const columns = deepFreeze(
      makeColumns().map(column => ({ ...column, group: 'g' }))
    ) as Column[]
    const { control, changes } = mountLayout(columns)
    control('age').pin('left')
    await flush()
    const [next] = changes[0]
    expect(next[2]).toEqual({ ...columns[2], pinned: 'left' })
    expect((next[2] as Column & { group: string }).group).toBe('g')
    expect(next[0]).toBe(columns[0])
    expect(next[1]).toBe(columns[1])
    expect(next[3]).toBe(columns[3])
  })

  it('removes a field set back to its default instead of writing false', async () => {
    const columns: Column[] = [
      { field: 'a', title: 'A', pinned: 'left' },
      { field: 'b', title: 'B' }
    ]
    const { control, changes } = mountLayout(columns)
    control('a').pin(false)
    await flush()
    expect(changes[0][1]).toBe('pin')
    expect(changes[0][0][0]).toEqual({ field: 'a', title: 'A' })
    expect('pinned' in changes[0][0][0]).toBe(false)
  })

  it('emits nothing on mount, on an outside change or for an equal result', async () => {
    const { m, control, changes } = mountLayout(makeColumns())
    await m.wrapper.setProps({ columns: makeColumns().reverse() })
    await flush()
    control('id').move('right') // id is now last: the edge
    control('name').pin(false) // not pinned already
    await flush()
    expect(changes).toEqual([])
    expect(m.events).toEqual([])
  })

  it('an ignored update draws the old columns', async () => {
    const { m, control, changes, headerFields } = mountLayout(makeColumns(), {
      writeBack: false
    })
    control('id').move('right')
    await flush()
    expect(changes).toHaveLength(1)
    expect(headerFields()).toEqual(['id', 'name', 'age', 'joined'])
    expect(m.events).toEqual([])
  })

  it('emits update:columns with reason resize after columnResize', async () => {
    const { m, changes } = mountLayout(makeColumns(), {
      props: { resizable: true }
    })
    const handle = m.wrapper.find('th[data-field="age"] .qt-resize-handle')
    await handle.trigger('keydown', { key: 'ArrowRight' })
    const resized = m.wrapper.emitted('columnResize') as [
      { field: string; width: number }
    ][]
    expect(resized).toHaveLength(1)
    expect(changes).toHaveLength(1)
    expect(changes[0][1]).toBe('resize')
    expect(changes[0][0][2].width).toBe(`${resized[0][0].width}px`)
    expect(m.events).toEqual([])
  })
})

describe('C-69 Column order [tanstack] [own]', () => {
  const regioned = (): Column[] => [
    { field: 'a', title: 'A' },
    { field: 'l1', title: 'L1', pinned: 'left' },
    { field: 'h', title: 'H', hide: true },
    { field: 'b', title: 'B' },
    { field: 'r1', title: 'R1', pinned: 'right' },
    { field: 'l2', title: 'L2', pinned: 'left' },
    { field: 'r2', title: 'R2', pinned: 'right' }
  ]

  it('draws left, center, right, each in array order', () => {
    const { headerFields } = mountLayout(regioned())
    expect(headerFields()).toEqual(['l1', 'l2', 'a', 'b', 'r1', 'r2'])
  })

  it('moves one visible position inside the region; hidden columns keep their place', async () => {
    const { control, changes, headerFields } = mountLayout(regioned())
    control('b').move('left')
    await flush()
    expect(changes[0][1]).toBe('order')
    expect(changes[0][0].map(c => c.field)).toEqual([
      'b',
      'a',
      'l1',
      'h',
      'r1',
      'l2',
      'r2'
    ])
    expect(headerFields()).toEqual(['l1', 'l2', 'b', 'a', 'r1', 'r2'])
    control('r1').move('right')
    await flush()
    expect(changes[1][0].map(c => c.field)).toEqual([
      'b',
      'a',
      'l1',
      'h',
      'l2',
      'r2',
      'r1'
    ])
  })

  it('reports and stops at the region edges', () => {
    const { control, changes } = mountLayout(regioned())
    expect([control('l1').canMoveLeft, control('l1').canMoveRight]).toEqual([
      false,
      true
    ])
    expect([control('l2').canMoveRight, control('a').canMoveLeft]).toEqual([
      false,
      false
    ])
    expect([control('r1').canMoveLeft, control('r2').canMoveRight]).toEqual([
      false,
      false
    ])
    control('l2').move('right')
    control('a').move('left')
    control('r2').move('right')
    expect(changes).toEqual([])
  })
})

describe('C-70 Column controls in slots [tanstack] [own]', () => {
  it('gives control to the header and filter-menu slots, without TanStack objects', async () => {
    let menu: FilterMenuSlotProps | null = null
    const m = mountTable(
      { filterable: true },
      {
        slots: {
          'filter-menu': (p: FilterMenuSlotProps) => {
            menu = p
            return h(p.trigger)
          }
        }
      }
    )
    mounted = m
    await flush()
    const control = (menu as FilterMenuSlotProps | null)!.control
    expect(Object.keys(control).sort()).toEqual(
      ['canMoveLeft', 'canMoveRight', 'hide', 'move', 'pin', 'pinned'].sort()
    )
    expect(control.pinned).toBe(false)
    const values = Object.values(control) as unknown[]
    expect(
      values.every(
        value =>
          typeof value === 'boolean' ||
          typeof value === 'string' ||
          typeof value === 'function'
      )
    ).toBe(true)
  })

  it('pin(side) emits reason pin; the same side emits nothing', async () => {
    const { m, control, changes, headerFields } = mountLayout(makeColumns())
    control('age').pin('left')
    await flush()
    expect(changes.map(([, r]) => r)).toEqual(['pin'])
    expect(headerFields()[0]).toBe('age')
    expect(control('age').pinned).toBe('left')
    control('age').pin('left')
    await flush()
    expect(changes).toHaveLength(1)
    control('name').pin('right')
    await flush()
    expect(changes[1][1]).toBe('pin')
    expect(headerFields()).toEqual(['age', 'id', 'joined', 'name'])
    expect(m.events).toEqual([])
  })
})

describe('C-68 composable: TanStack calls go to the consumer [tanstack]', () => {
  it('setColumnOrder, toggleVisibility and pin call onColumnsChange and change no state', () => {
    const columns: Column[] = [
      { field: 'a' },
      { field: 'b', pinned: 'left' },
      { field: 'c', hide: true }
    ]
    const changes: ColumnsEvent[] = []
    const scope = effectScope()
    const state = scope.run(() =>
      useQueryTable({
        query: makeQuery(),
        columns,
        onQueryChange: () => {},
        onColumnsChange: (next, reason) => changes.push([next, reason])
      })
    )!
    const { table } = state
    const slices = () => ({
      columnOrder: table.atoms.columnOrder.get(),
      columnVisibility: table.atoms.columnVisibility.get(),
      columnPinning: table.atoms.columnPinning.get()
    })
    const projected = {
      columnOrder: ['a', 'b', 'c'],
      columnVisibility: { a: true, b: true, c: false },
      columnPinning: { start: ['b'], end: [] }
    }
    expect(slices()).toEqual(projected)

    table.setColumnOrder(['b', 'a'])
    table.getColumn('a')!.toggleVisibility(false)
    table.getColumn('a')!.pin('end')

    expect(changes.map(([, reason]) => reason)).toEqual([
      'order',
      'visibility',
      'pin'
    ])
    expect(changes[0][0].map(c => c.field)).toEqual(['b', 'a', 'c'])
    expect(changes[1][0][0]).toEqual({ field: 'a', hide: true })
    expect(changes[2][0][0]).toEqual({ field: 'a', pinned: 'right' })
    expect(slices()).toEqual(projected)
    scope.stop()
  })
})
