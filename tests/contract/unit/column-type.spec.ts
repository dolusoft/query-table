import { afterEach, describe, expect, it } from 'vitest'

import type { Column } from '@dolusoft/query-table'

import { mountTable, type Mounted } from '../../support/mount-table'

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

const typed: Column[] = [
  { field: 'name', title: 'Name', type: 'string' },
  { field: 'price', title: 'Price', type: 'number' },
  { field: 'count', title: 'Count', type: 'integer' },
  { field: 'active', title: 'Active', type: 'bool' },
  { field: 'day', title: 'Day', type: 'date' },
  { field: 'at', title: 'At', type: 'datetime' }
]

const row = {
  name: 'alice',
  price: 1.5,
  count: 3,
  active: true,
  day: '2024-01-10',
  at: '2024-01-10T08:00:00Z'
}

/** `data-field` -> `data-type` of the cells under `selector` that carry a field. */
const typesOf = (
  m: Mounted,
  selector: string
): Record<string, string | undefined> =>
  Object.fromEntries(
    m.wrapper
      .findAll(`${selector}[data-field]`)
      .map((cell): [string, string | undefined] => [
        cell.attributes('data-field') ?? '',
        cell.attributes('data-type')
      ])
  )

describe('C-82 Column type on cells [own]', () => {
  const expected = {
    name: 'string',
    price: 'number',
    count: 'integer',
    active: 'bool',
    day: 'date',
    at: 'datetime'
  }

  it('writes the column type on its header, body and footer cells', () => {
    const m = mountIt({
      columns: typed,
      rows: [row],
      totalRows: 1,
      footerRows: [{ cells: [{ field: 'price', text: 'Sum' }] }]
    })
    expect(typesOf(m, 'thead th')).toEqual(expected)
    expect(typesOf(m, 'tbody tr[data-row-index] > td')).toEqual(expected)
    expect(typesOf(m, '.qt-footer td')).toEqual(expected)
  })

  it('reads the type as C-39 does: case-insensitive, `string` when missing or unknown', () => {
    const m = mountIt({
      columns: [
        { field: 'a', title: 'A', type: 'DateTime' as never },
        { field: 'b', title: 'B' },
        { field: 'c', title: 'C', type: 'money' as never }
      ],
      rows: [{ a: '2024-01-10T08:00:00Z', b: 'x', c: 1 }],
      totalRows: 1,
      footerRows: [{ cells: [{ field: 'b', text: 'Total' }] }]
    })
    const want = { a: 'datetime', b: 'string', c: 'string' }
    expect(typesOf(m, 'thead th')).toEqual(want)
    expect(typesOf(m, 'tbody tr[data-row-index] > td')).toEqual(want)
    expect(typesOf(m, '.qt-footer td')).toEqual(want)
  })

  it('leaves the utility cells, the subtable and the empty row without a type', async () => {
    const m = mountIt({
      columns: typed,
      rows: [row],
      totalRows: 1,
      hasSubtable: true,
      hasRightPanel: true,
      selection: {},
      footerRows: [{ cells: [{ field: 'price', text: 'Sum' }] }]
    })
    await m.wrapper.find('.qt-expand').trigger('click')
    const typedCells = m.wrapper.findAll('[data-type]')
    expect(typedCells.length).toBe(typed.length * 3)
    expect(typedCells.every(cell => cell.attributes('data-field'))).toBe(true)
    expect(
      m.wrapper.find('.qt-subtable-row td').attributes('data-type')
    ).toBeUndefined()

    const empty = mountTable(
      { columns: typed, rows: [], totalRows: 0 },
      { slots: { empty: '<span>nothing</span>' } }
    )
    expect(
      empty.wrapper.find('.qt-empty-row td').attributes('data-type')
    ).toBeUndefined()
    empty.wrapper.unmount()
  })

  it('changes no cell content: no placeholder for an empty value, no icon (C-30)', () => {
    const m = mountIt({
      columns: typed,
      rows: [
        {
          name: null,
          price: undefined,
          count: 0,
          active: false,
          day: '',
          at: null
        }
      ],
      totalRows: 1
    })
    const cells = m.wrapper.findAll('tbody tr[data-row-index] > td[data-field]')
    expect(cells.map(cell => cell.element.innerHTML)).toEqual([
      '',
      '',
      '0',
      'false',
      '',
      ''
    ])
  })

  it('follows a change of the column type', async () => {
    const m = mountIt({
      columns: [{ field: 'n', title: 'N', type: 'string' }],
      rows: [{ n: 1 }],
      totalRows: 1
    })
    await m.wrapper.setProps({
      columns: [{ field: 'n', title: 'N', type: 'integer' }]
    })
    expect(typesOf(m, 'thead th')).toEqual({ n: 'integer' })
    expect(typesOf(m, 'tbody tr[data-row-index] > td')).toEqual({
      n: 'integer'
    })
  })
})
