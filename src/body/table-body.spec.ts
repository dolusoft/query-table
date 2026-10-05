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
} from '../../tests/support/mount-table'
import type { CellContextMenuPayload, Column } from '../contract'
import QueryTable from '../index'

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
  const buttons = (m: Mounted) => m.wrapper.findAll('.qt-expand')

  it('shows the subtable slot under the row and flips data-expanded', async () => {
    const m = mountIt({ hasSubtable: true }, { slots: subtable })
    await buttons(m)[1].trigger('click')
    expect(m.wrapper.findAll('.qt-subtable-row')).toHaveLength(1)
    expect(m.wrapper.find('.detail').text()).toBe('alice')
    expect(
      m.wrapper.find('tr[data-row-index="1"]').attributes('data-expanded')
    ).toBe('')
    expect(buttons(m)[1].attributes('aria-expanded')).toBe('true')
    await buttons(m)[1].trigger('click')
    expect(m.wrapper.find('.qt-subtable-row').exists()).toBe(false)
  })

  it('works for every row, with or without an id', async () => {
    const rows = [{ name: 'no id' }, { id: 0, name: 'zero id' }]
    const m = mountIt({ hasSubtable: true, rows }, { slots: subtable })
    await buttons(m)[0].trigger('click')
    await buttons(m)[1].trigger('click')
    expect(m.wrapper.findAll('.detail').map(d => d.text())).toEqual([
      'no id',
      'zero id'
    ])
  })

  it('keys the state by rowKey, so it follows the row when rows reorder', async () => {
    const m = mountIt({ hasSubtable: true, rowKey: 'id' }, { slots: subtable })
    await buttons(m)[0].trigger('click')
    await m.wrapper.setProps({ rows: [...makeRows()].reverse() })
    expect(m.wrapper.find('.detail').text()).toBe('Charlie')
    expect(
      m.wrapper
        .find('.qt-subtable-row')
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

  it('keeps only the keys of the supplied rows, so a row that leaves and comes back is closed', async () => {
    const m = mountIt({ hasSubtable: true, rowKey: 'id' }, { slots: subtable })
    await buttons(m)[0].trigger('click')
    await m.wrapper.setProps({ rows: makeRows().slice(1) })
    expect(m.wrapper.find('.detail').exists()).toBe(false)
    await m.wrapper.setProps({ rows: makeRows() })
    expect(m.wrapper.find('.detail').exists()).toBe(false)
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
    expect(m.wrapper.findAll('.qt-subtable-row')).toHaveLength(1)
  })

  it('collapseAll closes every row', async () => {
    const m = mountIt({ hasSubtable: true }, { slots: subtable })
    await buttons(m)[0].trigger('click')
    await buttons(m)[1].trigger('click')
    expect(m.wrapper.findAll('.qt-subtable-row')).toHaveLength(2)
    ;(m.wrapper.vm as unknown as { collapseAll: () => void }).collapseAll()
    await flush()
    expect(m.wrapper.find('.qt-subtable-row').exists()).toBe(false)
  })

  it('draws no expand button without hasSubtable', () => {
    const m = mountIt({}, { slots: subtable })
    expect(m.wrapper.find('.qt-expand').exists()).toBe(false)
  })
})

describe('C-27 Cell slots', () => {
  it('renders cell-<field> for that column only, with the row, index, column and value', () => {
    const m = mountIt(
      { columns: makeColumns().slice(0, 3) },
      {
        slots: {
          'cell-name':
            '<i class="by-field">{{ params.cellValue }}|{{ params.rowIndex }}|{{ params.column.field }}|{{ params.row.id }}</i>'
        }
      }
    )
    expect(m.wrapper.findAll('td[data-field="name"] .by-field')).toHaveLength(5)
    expect(m.wrapper.find('td[data-field="name"] .by-field').text()).toBe(
      'Charlie|0|name|1'
    )
    expect(m.wrapper.find('td[data-field="id"] .by-field').exists()).toBe(false)
    expect(m.wrapper.find('td[data-field="id"]').text()).toBe('1')
    expect(m.wrapper.find('td[data-field="age"]').text()).toBe('30')
  })
})

describe('C-28 Context menu', () => {
  // The table answers right clicks only for a consumer that listens.
  const listen = { onCellContextMenu: () => undefined }

  it('emits nothing and keeps the browser menu when nobody listens', () => {
    const m = mountIt()
    const cell = m.wrapper.find(
      'tbody tr[data-row-index="2"] td[data-field="age"]'
    )
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    })
    cell.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(m.wrapper.emitted('cellContextMenu')).toBeUndefined()
  })

  it('emits cellContextMenu with the payload and suppresses the browser menu', () => {
    const m = mountIt(listen)
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

  it('treats a .once listener as a listener', () => {
    const m = mountIt({ onCellContextMenuOnce: () => undefined })
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    })
    m.wrapper
      .find('tbody tr[data-row-index="0"] td[data-field="name"]')
      .element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  const rightClick = (target: Element) => {
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    })
    target.dispatchEvent(event)
    return event
  }

  it('answers a right click on content inside a cell for that cell', () => {
    const m = mountIt(
      { columns: makeColumns().slice(0, 2), ...listen },
      { slots: { 'cell-name': '<b class="inner">{{ params.cellValue }}</b>' } }
    )
    const event = rightClick(m.wrapper.findAll('td .inner')[1].element)
    expect(event.defaultPrevented).toBe(true)
    const payload = (
      m.wrapper.emitted('cellContextMenu') as [CellContextMenuPayload<object>][]
    )[0][0]
    expect(payload.rowIndex).toBe(1)
    expect(payload.column.field).toBe('name')
    expect(payload.cellValue).toBe('alice')
  })

  it('emits nothing and keeps the browser menu on utility cells, the subtable row and the empty row', async () => {
    const m = mountIt(
      { hasSubtable: true, hasRightPanel: true },
      { slots: { ...subtable, empty: '<i class="none">nothing</i>' } }
    )
    await m.wrapper.find('.qt-expand').trigger('click')
    const targets = [
      m.wrapper.find('.qt-right-panel-button').element,
      m.wrapper.find('.qt-expand').element,
      m.wrapper.find('.qt-subtable-row .detail').element
    ]
    for (const target of targets) {
      expect(rightClick(target).defaultPrevented).toBe(false)
    }
    await m.wrapper.setProps({ rows: [] })
    expect(
      rightClick(m.wrapper.find('.qt-empty-row .none').element).defaultPrevented
    ).toBe(false)
    expect(m.wrapper.emitted('cellContextMenu')).toBeUndefined()
  })

  it('leaves the cells of a table nested in a subtable slot to that table', async () => {
    const inner: CellContextMenuPayload<object>[] = []
    const m = mountIt(
      { hasSubtable: true },
      {
        slots: {
          subtable: () =>
            h(QueryTable as never, {
              query: makeQuery(),
              columns: [{ field: 'name', title: 'Name' }],
              rows: [{ name: 'inner' }],
              onCellContextMenu: (payload: CellContextMenuPayload<object>) =>
                inner.push(payload)
            })
        }
      }
    )
    await m.wrapper.find('.qt-expand').trigger('click')
    const cell = m.wrapper.find('.qt-subtable-row td[data-field="name"]')
    expect(rightClick(cell.element).defaultPrevented).toBe(true)
    expect(inner).toHaveLength(1)
    expect(inner[0].cellValue).toBe('inner')
    expect(m.wrapper.emitted('cellContextMenu')).toBeUndefined()
  })

  it('emits for the inner cell and then for the outer cell when a table sits in a cell-<field> slot', () => {
    const inner: CellContextMenuPayload<object>[] = []
    const m = mountIt(
      { columns: makeColumns().slice(0, 2), ...listen },
      {
        slots: {
          'cell-name': () =>
            h(QueryTable as never, {
              query: makeQuery(),
              columns: [{ field: 'label', title: 'Label' }],
              rows: [{ label: 'inner' }],
              onCellContextMenu: (payload: CellContextMenuPayload<object>) =>
                inner.push(payload)
            })
        }
      }
    )
    const cell = m.wrapper.findAll(
      'td[data-field="name"] td[data-field="label"]'
    )[1]
    const event = rightClick(cell.element)
    expect(event.defaultPrevented).toBe(true)
    // The inner table answers for its own cell...
    expect(inner).toHaveLength(1)
    expect(inner[0].cellValue).toBe('inner')
    expect(inner[0].column.field).toBe('label')
    // ...and the outer table answers for the cell that holds it.
    const outer = m.wrapper.emitted('cellContextMenu') as [
      CellContextMenuPayload<object>
    ][]
    expect(outer).toHaveLength(1)
    expect(outer[0][0].event).toBe(event)
    expect(outer[0][0].rowIndex).toBe(1)
    expect(outer[0][0].column.field).toBe('name')
    expect(outer[0][0].columnIndex).toBe(1)
  })

  it('columnIndex counts hidden columns, because it indexes columns', () => {
    const columns: Column[] = [
      { field: 'id', hide: true },
      { field: 'name', title: 'Name' }
    ]
    const m = mountIt({ columns, ...listen })
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
  it('draws long text whole and sets no title', () => {
    const long = 'x'.repeat(300)
    const m = mountIt({
      columns: [{ field: 'name' }],
      rows: [{ name: long }]
    })
    const cell = m.wrapper.find('td')
    expect(cell.text()).toBe(long)
    expect(cell.attributes('title')).toBeUndefined()
  })

  it('escapes the text: markup in a value is drawn as text', () => {
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
    await m.wrapper.findAll('.qt-right-panel-button')[3].trigger('click')
    const emitted = m.wrapper.emitted('rowRightPanelClick')!
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe(propsOf(m).rows[3])
  })

  it('draws no button without hasRightPanel', () => {
    expect(mountIt().wrapper.find('.qt-right-panel-button').exists()).toBe(
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

describe('C-38 Empty and loading', () => {
  const slots = {
    empty: '<span class="none">nothing</span>'
  }

  it('hides the empty state while loading, and shows it when loading ends without rows', async () => {
    const m = mountIt(
      { rows: [], loading: true },
      { slots: { ...slots, loading: '<i class="wait">wait</i>' } }
    )
    const root = () => m.wrapper.find('.qt-datatable')
    expect(m.wrapper.find('.qt-empty-row').exists()).toBe(false)
    expect(root().attributes('data-empty')).toBe(undefined)
    expect(m.wrapper.find('.qt-loading-row .wait').exists()).toBe(true)
    await m.wrapper.setProps({ loading: false })
    expect(m.wrapper.find('.qt-empty-row .none').exists()).toBe(true)
    expect(root().attributes('data-empty')).toBe('')
    expect(m.wrapper.find('.qt-loading-row').exists()).toBe(false)
  })

  it('hides the empty state while loading without a loading slot too', () => {
    const m = mountIt({ rows: [], loading: true }, { slots })
    expect(m.wrapper.find('.qt-empty-row').exists()).toBe(false)
    expect(m.wrapper.findAll('tbody tr')).toHaveLength(0)
  })

  it('shows the empty slot whenever there are no rows, and hides it when rows arrive', async () => {
    const m = mountIt({ rows: [] }, { slots })
    expect(m.wrapper.find('.qt-empty-row .none').exists()).toBe(true)
    await m.wrapper.setProps({ rows: makeRows() })
    expect(m.wrapper.find('.qt-empty-row').exists()).toBe(false)
    expect(m.wrapper.findAll('tbody tr[data-row-index]')).toHaveLength(5)
  })

  it('draws no row for a slot that is not given', () => {
    const m = mountIt({ rows: [] })
    expect(m.wrapper.find('.qt-empty-row').exists()).toBe(false)
  })

  it('spans the utility columns too', () => {
    const m = mountIt(
      { rows: [], hasSubtable: true, hasRightPanel: true },
      { slots }
    )
    expect(m.wrapper.find('.qt-empty-row td').attributes('colspan')).toBe('6')
  })
})

describe('C-52 Loading state', () => {
  const loadingSlot = { loading: '<i class="wait">wait</i>' }
  const root = (m: Mounted) => m.wrapper.find('.qt-datatable')

  it('marks the root with data-loading and aria-busy only while loading', async () => {
    const m = mountIt({}, { slots: loadingSlot })
    expect(root(m).attributes('data-loading')).toBe(undefined)
    expect(root(m).attributes('aria-busy')).toBe(undefined)
    await m.wrapper.setProps({ loading: true })
    expect(root(m).attributes('data-loading')).toBe('')
    expect(root(m).attributes('aria-busy')).toBe('true')
    await m.wrapper.setProps({ loading: false })
    expect(root(m).attributes('data-loading')).toBe(undefined)
    expect(root(m).attributes('aria-busy')).toBe(undefined)
  })

  it('keeps the rows, their elements and the focus, and emits nothing', async () => {
    const m = mountIt(
      { hasSubtable: true, rowKey: 'id' },
      { slots: loadingSlot }
    )
    const before = m.wrapper.findAll('tr[data-row-index]').map(r => r.element)
    const button = m.wrapper.findAll<HTMLButtonElement>('.qt-expand')[2]
    button.element.focus()
    expect(document.activeElement).toBe(button.element)
    await m.wrapper.setProps({ loading: true })
    const during = m.wrapper.findAll('tr[data-row-index]').map(r => r.element)
    expect(during).toEqual(before)
    expect(during.every((row, i) => row === before[i])).toBe(true)
    expect(document.activeElement).toBe(button.element)
    await m.wrapper.setProps({ loading: false })
    expect(document.activeElement).toBe(button.element)
    expect(m.events).toEqual([])
  })

  it('ends the body with one loading row that spans every column and has no style', () => {
    const m = mountIt(
      { loading: true, hasSubtable: true, hasRightPanel: true },
      { slots: loadingSlot }
    )
    const bodyRows = m.wrapper.findAll('tbody > tr')
    const last = bodyRows[bodyRows.length - 1]
    expect(bodyRows).toHaveLength(6)
    expect(last.classes()).toEqual(['qt-loading-row'])
    expect(last.attributes('style')).toBe(undefined)
    const cells = last.findAll('td')
    expect(cells).toHaveLength(1)
    expect(cells[0].attributes('colspan')).toBe('6')
    expect(cells[0].attributes('style')).toBe(undefined)
    expect(cells[0].find('.wait').exists()).toBe(true)
  })

  it('draws nothing for loading without the slot', () => {
    const m = mountIt({ loading: true })
    expect(m.wrapper.find('.qt-loading-row').exists()).toBe(false)
    expect(m.wrapper.findAll('tbody > tr')).toHaveLength(5)
  })

  it('blocks no interaction: a sort while loading emits as usual', async () => {
    const m = mountIt({ loading: true, sortable: true }, { slots: loadingSlot })
    await m.wrapper.find('th[data-field="name"] .qt-sort').trigger('click')
    expect(m.events.map(([query, reason]) => [query.sort, reason])).toEqual([
      [{ field: 'name', direction: 'asc' }, 'sort']
    ])
  })

  it('emits no cellContextMenu for the loading row', async () => {
    const seen: unknown[] = []
    const m = mountIt(
      { loading: true, onCellContextMenu: (p: unknown) => seen.push(p) },
      { slots: loadingSlot }
    )
    await m.wrapper.find('.qt-loading-row .wait').trigger('contextmenu')
    expect(seen).toEqual([])
  })
})

describe('C-55 expandAll', () => {
  const expose = (m: Mounted) =>
    m.wrapper.vm as unknown as { expandAll(): void; collapseAll(): void }
  const expandedIndexes = (m: Mounted) =>
    m.wrapper
      .findAll('tr[data-expanded]')
      .map(row => row.attributes('data-row-index'))

  it('opens every row given, by rowKey, and emits nothing', async () => {
    const m = mountIt({ hasSubtable: true, rowKey: 'id' }, { slots: subtable })
    expose(m).expandAll()
    await flush()
    expect(expandedIndexes(m)).toEqual(['0', '1', '2', '3', '4'])
    expect(m.wrapper.findAll('.qt-subtable-row')).toHaveLength(5)
    expose(m).collapseAll()
    await flush()
    expect(expandedIndexes(m)).toEqual([])
    expect(m.events).toEqual([])
  })

  it('does not open rows that arrive later, and keeps the rows that stay', async () => {
    const m = mountIt({ hasSubtable: true, rowKey: 'id' }, { slots: subtable })
    expose(m).expandAll()
    await flush()
    const rows = propsOf(m).rows as Array<{ id: number }>
    // Rows 4 and 5 stay, two new rows come.
    await m.wrapper.setProps({
      rows: [
        rows[3],
        rows[4],
        { id: 6, name: 'Fay', age: 20, joined: '2024-06-01' },
        { id: 7, name: 'Gus', age: 21, joined: '2024-07-01' }
      ]
    })
    expect(expandedIndexes(m)).toEqual(['0', '1'])
  })

  it('does nothing without hasSubtable', async () => {
    const m = mountIt({ rowKey: 'id' })
    expose(m).expandAll()
    await m.wrapper.setProps({ hasSubtable: true })
    expect(expandedIndexes(m)).toEqual([])
  })
})
