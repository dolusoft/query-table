import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import type {
  CellContextMenuPayload,
  Column,
  FilterMenuSlotProps
} from '../src/contract'
import {
  flush,
  makeColumns,
  makeQuery,
  makeRows,
  mountTable,
  propsOf,
  type Mounted
} from './helpers'

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

const subtable = { subtable: '<b class="detail">{{ params.row.name }}</b>' }

describe('C-26 Row expansion', () => {
  const buttons = (m: Mounted) => m.wrapper.findAll('.bh-expand')

  it('shows the subtable slot under the row and flips data-expanded', async () => {
    const m = mountIt({ hasSubtable: true }, { slots: subtable })
    await buttons(m)[1].trigger('click')
    expect(m.wrapper.findAll('.bh-subtable-row')).toHaveLength(1)
    expect(m.wrapper.find('.detail').text()).toBe('alice')
    expect(m.wrapper.find('tr[data-row-index="1"]').attributes('data-expanded')).toBe(
      ''
    )
    expect(buttons(m)[1].attributes('aria-expanded')).toBe('true')
    await buttons(m)[1].trigger('click')
    expect(m.wrapper.find('.bh-subtable-row').exists()).toBe(false)
  })

  it('works for rows that have a truthy id', async () => {
    const m = mountIt({ hasSubtable: true }, { slots: subtable })
    expect(makeRows().every(row => row.id > 0)).toBe(true)
    await buttons(m)[0].trigger('click')
    expect(m.wrapper.find('.detail').text()).toBe('Charlie')
  })

  it('keys the state by rowKey, so it follows the row when rows reorder', async () => {
    const m = mountIt(
      { hasSubtable: true, rowKey: 'id' },
      { slots: subtable }
    )
    await buttons(m)[0].trigger('click')
    await m.wrapper.setProps({ rows: [...makeRows()].reverse() })
    expect(m.wrapper.find('.detail').text()).toBe('Charlie')
    expect(
      m.wrapper.find('.bh-subtable-row').element.previousElementSibling
        ?.getAttribute('data-row-index')
    ).toBe('4')
  })

  it('keeps the component state of a subtable with its row when rows reorder', async () => {
    // Each mount of the probe takes a new number: the same number after the
    // reorder means the component was moved with its row, not rebuilt.
    let mounts = 0
    const Probe = defineComponent({
      props: { name: { type: String, required: true } },
      setup(probe) {
        const id = ++mounts
        return () => h('b', { class: 'probe', 'data-name': probe.name }, String(id))
      }
    })
    const m = mountIt(
      { hasSubtable: true, rowKey: 'id' },
      { slots: { subtable: ((p: { row: { name: string } }) => h(Probe, { name: p.row.name })) as never } }
    )
    await buttons(m)[0].trigger('click')
    await buttons(m)[1].trigger('click')
    const idOf = (name: string) =>
      m.wrapper.find(`.probe[data-name="${name}"]`).text()
    const before = { Charlie: idOf('Charlie'), alice: idOf('alice') }
    await m.wrapper.setProps({ rows: [...makeRows()].reverse() })
    expect(m.wrapper.findAll('.probe')).toHaveLength(2)
    expect(idOf('Charlie')).toBe(before.Charlie)
    expect(idOf('alice')).toBe(before.alice)
    expect(mounts).toBe(2)
  })

  it('keys the state by a rowKey function', async () => {
    const m = mountIt(
      { hasSubtable: true, rowKey: (row: { name: string }) => row.name },
      { slots: subtable }
    )
    await buttons(m)[2].trigger('click')
    await m.wrapper.setProps({ rows: makeRows().slice(1) })
    expect(m.wrapper.find('.detail').text()).toBe('Bob')
  })

  it('resets by index when there is no rowKey and rows change', async () => {
    const m = mountIt({ hasSubtable: true }, { slots: subtable })
    await buttons(m)[0].trigger('click')
    expect(m.wrapper.find('.detail').exists()).toBe(true)
    await m.wrapper.setProps({ rows: makeRows().slice() })
    expect(m.wrapper.find('.detail').exists()).toBe(false)
  })

  it('seeds the state from a row with isExpanded set', async () => {
    const rows = makeRows().map((row, i) => ({ ...row, isExpanded: i === 3 }))
    const m = mountIt({ hasSubtable: true, rows }, { slots: subtable })
    expect(m.wrapper.find('.detail').text()).toBe('Dave')
    expect(m.wrapper.findAll('.bh-subtable-row')).toHaveLength(1)
  })

  it('collapseAll closes every row', async () => {
    const m = mountIt({ hasSubtable: true }, { slots: subtable })
    await buttons(m)[0].trigger('click')
    await buttons(m)[1].trigger('click')
    expect(m.wrapper.findAll('.bh-subtable-row')).toHaveLength(2)
    ;(m.wrapper.vm as unknown as { collapseAll: () => void }).collapseAll()
    await flush()
    expect(m.wrapper.find('.bh-subtable-row').exists()).toBe(false)
  })

  it('draws no expand button without hasSubtable', () => {
    const m = mountIt({}, { slots: subtable })
    expect(m.wrapper.find('.bh-expand').exists()).toBe(false)
  })
})

describe('C-27 Cell slots', () => {
  it('renders cell-<field> for that column and cell for the rest, with the same props', () => {
    const m = mountIt(
      { columns: makeColumns().slice(0, 3) },
      {
        slots: {
          'cell-name':
            '<i class="by-field">{{ params.cellValue }}|{{ params.rowIndex }}|{{ params.column.field }}|{{ params.row.id }}</i>',
          cell: '<u class="generic">{{ params.column.field }}</u>'
        }
      }
    )
    expect(m.wrapper.findAll('td[data-field="name"] .by-field')).toHaveLength(5)
    expect(m.wrapper.find('td[data-field="name"] .by-field').text()).toBe(
      'Charlie|0|name|1'
    )
    expect(m.wrapper.findAll('td[data-field="id"] .generic')).toHaveLength(5)
    expect(m.wrapper.findAll('td[data-field="age"] .generic')).toHaveLength(5)
    expect(m.wrapper.find('td[data-field="name"] .generic').exists()).toBe(false)
  })

  it('skips truncation', () => {
    const long = 'x'.repeat(40)
    const m = mountIt(
      {
        columns: [{ field: 'name' }],
        rows: [{ name: long }],
        truncateMaxLength: 10
      },
      { slots: { cell: '<span class="full">{{ params.cellValue }}</span>' } }
    )
    expect(m.wrapper.find('.full').text()).toBe(long)
    expect(m.wrapper.find('td').attributes('title')).toBeUndefined()
  })
})

describe('C-28 Context menu', () => {
  it('emits cellContextMenu with the payload and suppresses the browser menu', async () => {
    const m = mountIt()
    const cell = m.wrapper.find('tbody tr[data-row-index="2"] td[data-field="age"]')
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    cell.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    const emitted = m.wrapper.emitted('cellContextMenu') as [
      CellContextMenuPayload<{ name: string }>
    ][]
    expect(emitted).toHaveLength(1)
    const payload = emitted[0][0]
    expect(payload.event).toBe(event)
    expect(payload.row).toBe(propsOf(m).rows[2])
    expect(payload.column).toBe(propsOf(m).columns[2])
    expect(payload.cellValue).toBe(40)
    expect(payload.rowIndex).toBe(2)
    expect(payload.columnIndex).toBe(2)
  })

  it('columnIndex counts hidden columns, because it indexes columns', () => {
    const columns: Column[] = [
      { field: 'id', hide: true },
      { field: 'name', title: 'Name' }
    ]
    const m = mountIt({ columns })
    m.wrapper
      .find('td[data-field="name"]')
      .element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    const payload = (m.wrapper.emitted('cellContextMenu') as [
      CellContextMenuPayload<object>
    ][])[0][0]
    expect(payload.columnIndex).toBe(1)
  })
})

describe('C-29 Hidden columns', () => {
  it('draws a hidden column nowhere, and its rules still stay in the query', () => {
    const columns: Column[] = [
      ...makeColumns(),
      { field: 'secret', title: 'Secret', hide: true }
    ]
    const query = makeQuery({
      filters: [{ field: 'secret', condition: 'Equal', value: 1 }]
    })
    const m = mountIt({
      columns,
      query,
      footerRows: [{ cells: [{ field: 'secret', text: 'S' }] }],
      rows: [{ id: 1, name: 'a', age: 1, joined: 'x', secret: 'hidden-value' }]
    })
    expect(m.wrapper.find('[data-field="secret"]').exists()).toBe(false)
    expect(m.wrapper.text()).not.toContain('hidden-value')
    expect(m.wrapper.find('tfoot').text()).not.toContain('S')
    expect(m.query()).toEqual(query)
  })
})

describe('C-30 Cell text', () => {
  it('cuts long text with ... and puts the full text into title', () => {
    const long = 'abcdefghijklmnopqrstuvwxyz'
    const m = mountIt({
      columns: [{ field: 'name' }],
      rows: [{ name: long }, { name: 'short' }],
      truncateMaxLength: 10
    })
    const [first, second] = m.wrapper.findAll('td')
    expect(first.text()).toBe('abcdefghij...')
    expect(first.attributes('title')).toBe(long)
    expect(second.text()).toBe('short')
    expect(second.attributes('title')).toBeUndefined()
  })

  it('draws the text whole with truncate off', async () => {
    const long = 'x'.repeat(300)
    const m = mountIt({
      columns: [{ field: 'name' }],
      rows: [{ name: long }],
      truncate: false
    })
    expect(m.wrapper.find('td').text()).toBe(long)
  })

  it('renders html columns as HTML', () => {
    const m = mountIt({
      columns: [{ field: 'name', html: true }],
      rows: [{ name: '<em class="x">hi</em>' }]
    })
    expect(m.wrapper.find('td em.x').text()).toBe('hi')
  })

  it('escapes the text of other columns', () => {
    const m = mountIt({
      columns: [{ field: 'name' }],
      rows: [{ name: '<em class="x">hi</em>' }]
    })
    expect(m.wrapper.find('td em').exists()).toBe(false)
    expect(m.wrapper.find('td').text()).toBe('<em class="x">hi</em>')
  })

  it('reads dotted paths and draws nothing for a missing value', () => {
    const m = mountIt({
      columns: [{ field: 'user.name' }, { field: 'user.missing' }],
      rows: [{ user: { name: 'Zed' } }]
    })
    const [name, missing] = m.wrapper.findAll('td')
    expect(name.text()).toBe('Zed')
    expect(missing.text()).toBe('')
  })
})

describe('C-31 No styling', () => {
  it('writes no inline style except width on a header cell that defines it', () => {
    const m = mountIt({
      sortable: true,
      filterable: true,
      hasSubtable: true,
      hasRightPanel: true,
      loading: true,
      columns: [
        { field: 'id', title: 'ID', width: '80px' },
        { field: 'name', title: 'Name' },
        { field: 'joined', title: 'Joined', type: 'date' }
      ],
      footerRows: [{ cells: [{ field: 'id', text: 1 }] }]
    })
    const styled = m.wrapper.element.querySelectorAll('[style]')
    expect(styled).toHaveLength(1)
    expect(styled[0].tagName).toBe('TH')
    expect(styled[0].getAttribute('data-field')).toBe('id')
    expect((styled[0] as HTMLElement).style.width).toBe('80px')
  })

  it('declares no styling props', () => {
    const props = Object.keys(
      (mountIt().wrapper.vm.$.type as { props: Record<string, unknown> }).props
    )
    expect(props.filter(name => /^(class|style|skin|height|sticky|offset|width|theme)/i.test(name))).toEqual([])
  })
})

describe('C-32 State attributes', () => {
  it('sets the root attributes from the state', async () => {
    const m = mountIt({ rows: [], loading: true })
    const root = () => m.wrapper.find('.bh-datatable')
    expect(root().attributes('data-loading')).toBe('')
    expect(root().attributes('data-empty')).toBe('')
    expect(root().attributes('data-filtered')).toBeUndefined()
    expect(root().attributes('data-sorted')).toBeUndefined()
    await m.wrapper.setProps({
      rows: makeRows(),
      loading: false,
      query: makeQuery({
        sort: { field: 'name', direction: 'asc' },
        filters: [{ field: 'name', condition: 'Contains', value: 'a' }]
      })
    })
    expect(root().attributes('data-loading')).toBeUndefined()
    expect(root().attributes('data-empty')).toBeUndefined()
    expect(root().attributes('data-filtered')).toBe('')
    expect(root().attributes('data-sorted')).toBe('')
  })

  it('sets the header cell attributes and aria-sort', () => {
    const m = mountIt({
      sortable: true,
      filterable: true,
      query: makeQuery({
        sort: { field: 'age', direction: 'desc' },
        filters: [{ field: 'name', condition: 'Contains', value: 'a' }]
      })
    })
    const name = m.wrapper.find('th[data-field="name"]')
    const age = m.wrapper.find('th[data-field="age"]')
    expect(name.attributes()).toMatchObject({
      'data-type': 'string',
      'data-sortable': '',
      'data-filtered': ''
    })
    expect(name.attributes('data-sort')).toBeUndefined()
    expect(name.attributes('aria-sort')).toBeUndefined()
    expect(age.attributes('data-sort')).toBe('desc')
    expect(age.attributes('aria-sort')).toBe('descending')
    expect(age.attributes('data-type')).toBe('number')
    expect(age.attributes('data-filtered')).toBeUndefined()
  })

  it('maps asc to aria-sort ascending', () => {
    const m = mountIt({
      sortable: true,
      query: makeQuery({ sort: { field: 'age', direction: 'asc' } })
    })
    expect(m.wrapper.find('th[data-field="age"]').attributes('aria-sort')).toBe(
      'ascending'
    )
  })

  it('sets data-field and data-type on body and footer cells, and the row attributes', () => {
    const m = mountIt({
      footerRows: [{ cells: [{ field: 'age', text: 9 }] }]
    })
    const cell = m.wrapper.find('tbody tr[data-row-index="0"] td[data-field="age"]')
    expect(cell.attributes('data-type')).toBe('number')
    const foot = m.wrapper.find('tfoot td[data-field="age"]')
    expect(foot.attributes('data-type')).toBe('number')
    expect(m.wrapper.findAll('tbody tr[data-row-index]')).toHaveLength(5)
  })
})

describe('C-34 Filter menu slot', () => {
  it('draws no popover or tooltip and no filter button without the slot', () => {
    const m = mountIt({ filterable: true })
    expect(m.wrapper.find('.bh-filter-button').exists()).toBe(false)
    expect(m.wrapper.find('[role="tooltip"], [data-popper-placement]').exists()).toBe(
      false
    )
  })

  it('renders the slot right after the filter input, as its sibling', () => {
    const m = mountIt(
      { filterable: true },
      {
        slots: {
          'filter-menu': ((menu: FilterMenuSlotProps) =>
            h(menu.trigger)) as never
        }
      }
    )
    const input = m.wrapper.find('th[data-field="name"] .bh-filter-input')
    const button = input.element.nextElementSibling
    expect(button?.classList.contains('bh-filter-button')).toBe(true)
    expect(button?.parentElement).toBe(input.element.parentElement)
    // bool columns have no menu
    expect(m.wrapper.findAll('.bh-filter-button')).toHaveLength(4)
  })

  it('gives the slot the column, the rules, the conditions and a trigger that takes attributes', () => {
    const seen: FilterMenuSlotProps[] = []
    const m = mountIt(
      {
        filterable: true,
        sortable: true,
        query: makeQuery({
          sort: { field: 'name', direction: 'asc' },
          filters: [{ field: 'name', condition: 'StartsWith', value: 'a' }]
        })
      },
      {
        slots: {
          'filter-menu': ((menu: FilterMenuSlotProps) => {
            seen.push(menu)
            return h(menu.trigger, { 'data-extra': 'yes', class: 'extra' })
          }) as never
        }
      }
    )
    const name = seen.find(menu => menu.column.field === 'name')!
    expect(name.rules).toEqual([
      { field: 'name', condition: 'StartsWith', value: 'a' }
    ])
    expect(name.condition).toBe('StartsWith')
    expect(name.sortDirection).toBe('asc')
    expect(name.sortable).toBe(true)
    expect(name.conditions.length).toBeGreaterThan(3)
    const button = m.wrapper.find('th[data-field="name"] .bh-filter-button')
    expect(button.attributes('data-extra')).toBe('yes')
    expect(button.classes()).toContain('extra')
    expect(button.attributes('data-filtered')).toBe('')
    expect(m.wrapper.findAll('.bh-filter-button button, button button')).toHaveLength(0)
  })

  it('keeps the same trigger component across renders, so a wrapper does not remount it', async () => {
    const seen: FilterMenuSlotProps[] = []
    const m = mountIt(
      { filterable: true },
      {
        slots: {
          'filter-menu': ((menu: FilterMenuSlotProps) => {
            seen.push(menu)
            return h(menu.trigger)
          }) as never
        }
      }
    )
    const first = seen.find(menu => menu.column.field === 'name')!.trigger
    await m.setQuery(makeQuery({ page: 2 }))
    const last = [...seen].reverse().find(menu => menu.column.field === 'name')!
    expect(last.trigger).toBe(first)
  })
})

describe('C-36 Right panel', () => {
  it('emits rowRightPanelClick with the row', async () => {
    const m = mountIt({ hasRightPanel: true })
    await m.wrapper.findAll('.bh-right-panel-button')[3].trigger('click')
    const emitted = m.wrapper.emitted('rowRightPanelClick')!
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe(propsOf(m).rows[3])
  })

  it('draws no button without hasRightPanel', () => {
    expect(mountIt().wrapper.find('.bh-right-panel-button').exists()).toBe(false)
  })
})

describe('C-37 Footer rows', () => {
  it('draws footer rows in a tfoot, one cell per visible column, whatever totalRows is', () => {
    const columns: Column[] = [
      { field: 'id', title: 'ID' },
      { field: 'hidden', hide: true },
      { field: 'name', title: 'Name' }
    ]
    const m = mountIt({
      columns,
      totalRows: 0,
      footerRows: [
        { cells: [{ field: 'id', text: 'Sum' }, { field: 'name', text: 12 }] },
        { cells: [{ field: 'name', text: 'x' }] }
      ]
    })
    const rows = m.wrapper.findAll('tfoot tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].findAll('td').map(cell => cell.text())).toEqual(['Sum', '12'])
    expect(rows[1].findAll('td').map(cell => cell.text())).toEqual(['', 'x'])
  })

  it('draws no tfoot without footer rows', () => {
    expect(mountIt().wrapper.find('tfoot').exists()).toBe(false)
  })
})

describe('C-38 Loader and empty slots', () => {
  const slots = {
    loader: '<span class="spin">loading</span>',
    empty: '<span class="none">nothing</span>'
  }

  it('shows the loader while loading and the empty slot otherwise when there are no rows', async () => {
    const m = mountIt({ rows: [], loading: true }, { slots })
    expect(m.wrapper.find('.bh-loader-row .spin').exists()).toBe(true)
    expect(m.wrapper.find('.bh-empty-row').exists()).toBe(false)
    await m.wrapper.setProps({ loading: false })
    expect(m.wrapper.find('.bh-loader-row').exists()).toBe(false)
    expect(m.wrapper.find('.bh-empty-row .none').exists()).toBe(true)
  })

  it('shows neither with rows present, and keeps the rows while loading', async () => {
    const m = mountIt({ loading: true }, { slots })
    expect(m.wrapper.find('.bh-empty-row').exists()).toBe(false)
    expect(m.wrapper.findAll('tbody tr[data-row-index]')).toHaveLength(5)
  })

  it('draws no row for a slot that is not given', () => {
    const m = mountIt({ rows: [], loading: true })
    expect(m.wrapper.find('.bh-loader-row').exists()).toBe(false)
    expect(m.wrapper.find('.bh-empty-row').exists()).toBe(false)
  })

  it('spans the utility columns too', () => {
    const m = mountIt(
      { rows: [], hasSubtable: true, hasRightPanel: true },
      { slots }
    )
    expect(m.wrapper.find('.bh-empty-row td').attributes('colspan')).toBe('6')
  })
})
