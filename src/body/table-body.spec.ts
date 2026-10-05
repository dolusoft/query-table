import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import {
  flush,
  makeColumns,
  makeQuery,
  makeRows,
  mountTable,
  propsOf,
  type Mounted
} from '../../test-support/mount-table'
import type { CellContextMenuPayload, Column } from '../contract'

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
    expect(
      m.wrapper.find('tr[data-row-index="1"]').attributes('data-expanded')
    ).toBe('')
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
    const m = mountIt({ hasSubtable: true, rowKey: 'id' }, { slots: subtable })
    await buttons(m)[0].trigger('click')
    await m.wrapper.setProps({ rows: [...makeRows()].reverse() })
    expect(m.wrapper.find('.detail').text()).toBe('Charlie')
    expect(
      m.wrapper
        .find('.bh-subtable-row')
        .element.previousElementSibling?.getAttribute('data-row-index')
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
        return () =>
          h('b', { class: 'probe', 'data-name': probe.name }, String(id))
      }
    })
    const m = mountIt(
      { hasSubtable: true, rowKey: 'id' },
      {
        slots: {
          subtable: (p: { row: { name: string } }) =>
            h(Probe, { name: p.row.name })
        }
      }
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

  it('seeds the state from a row with isExpanded set', () => {
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
    expect(m.wrapper.find('td[data-field="name"] .generic').exists()).toBe(
      false
    )
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
  it('emits cellContextMenu with the payload and suppresses the browser menu', () => {
    const m = mountIt()
    const cell = m.wrapper.find(
      'tbody tr[data-row-index="2"] td[data-field="age"]'
    )
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    })
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
    const payload = (
      m.wrapper.emitted('cellContextMenu') as [CellContextMenuPayload<object>][]
    )[0][0]
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

  it('draws the text whole with truncate off', () => {
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

  it('never cuts an html column, so no tag is left open and the title stays plain', () => {
    const html = `<a href="/x/${'a'.repeat(200)}">link</a><b>bold</b>`
    const m = mountIt({
      columns: [{ field: 'name', html: true }],
      rows: [{ name: html }],
      truncateMaxLength: 10
    })
    const cell = m.wrapper.find('td')
    expect(cell.element.innerHTML).toBe(html)
    expect(cell.find('a').text()).toBe('link')
    expect(cell.find('b').text()).toBe('bold')
    expect(cell.attributes('title')).toBeUndefined()
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

describe('C-36 Right panel', () => {
  it('emits rowRightPanelClick with the row', async () => {
    const m = mountIt({ hasRightPanel: true })
    await m.wrapper.findAll('.bh-right-panel-button')[3].trigger('click')
    const emitted = m.wrapper.emitted('rowRightPanelClick')!
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe(propsOf(m).rows[3])
  })

  it('draws no button without hasRightPanel', () => {
    expect(mountIt().wrapper.find('.bh-right-panel-button').exists()).toBe(
      false
    )
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
        {
          cells: [
            { field: 'id', text: 'Sum' },
            { field: 'name', text: 12 }
          ]
        },
        { cells: [{ field: 'name', text: 'x' }] }
      ]
    })
    const rows = m.wrapper.findAll('tfoot tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].findAll('td').map(cell => cell.text())).toEqual([
      'Sum',
      '12'
    ])
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

  it('shows neither with rows present, and keeps the rows while loading', () => {
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
