import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CellContextMenuPayload, Column } from '@dolusoft/query-table'

import {
  flush,
  makeRows,
  mountTable,
  propsOf,
  type Mounted
} from '../../support/mount-table'

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

const pinnedColumns = (): Column[] => [
  { field: 'id', title: 'ID' },
  { field: 'name', title: 'Name', pinned: 'left' },
  { field: 'age', title: 'Age', hide: true, pinned: 'left' },
  { field: 'joined', title: 'Joined', pinned: 'left' }
]

const fieldsOf = (m: Mounted, selector: string) =>
  m.wrapper.findAll(selector).map(cell => cell.attributes('data-field') ?? '')

describe('C-46 Pinned columns come first', () => {
  it('draws pinned columns first in header, body and footer, in their order', () => {
    const m = mountIt({
      columns: pinnedColumns(),
      footerRows: [{ cells: [{ field: 'id', text: 1 }] }]
    })
    const order = ['name', 'joined', 'id']
    expect(fieldsOf(m, 'thead th')).toEqual(order)
    expect(fieldsOf(m, 'tbody tr[data-row-index="0"] td')).toEqual(order)
    expect(fieldsOf(m, 'tfoot td')).toEqual(order)
  })

  it('keeps columnIndex an index into columns', () => {
    const m = mountIt({ columns: pinnedColumns(), onCellContextMenu: () => {} })
    m.wrapper
      .find('tbody tr[data-row-index="1"] td[data-field="joined"]')
      .element.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      )
    const [[payload]] = m.wrapper.emitted('cellContextMenu') as [
      CellContextMenuPayload<object>
    ][]
    expect(payload.columnIndex).toBe(3)
    expect(payload.column).toBe(propsOf(m).columns[3])
  })

  it('keeps the utility cells in front and pins them with the columns', () => {
    const m = mountIt({
      columns: pinnedColumns(),
      hasSubtable: true,
      hasRightPanel: true
    })
    const cells = m.wrapper.findAll('tbody tr[data-row-index="0"] td')
    expect(cells[0].find('.qt-right-panel-button').exists()).toBe(true)
    expect(cells[1].find('.qt-expand').exists()).toBe(true)
    expect(cells.slice(0, 4).map(c => c.attributes('data-pinned'))).toEqual([
      '',
      '',
      '',
      ''
    ])
    expect(cells[4].attributes('data-pinned')).toBeUndefined()
  })
})

describe('C-47 Pin offsets', () => {
  it('marks every cell of a pinned column, the footer utility cell included', () => {
    const m = mountIt({
      columns: pinnedColumns(),
      hasSubtable: true,
      footerRows: [{ cells: [{ field: 'id', text: 1 }] }]
    })
    expect(
      m.wrapper.findAll('[data-pinned]').map(cell => cell.element.tagName)
    ).toEqual([
      // header: the utility and two pinned columns
      'TD',
      'TH',
      'TH',
      // five body rows of three pinned cells
      ...Array.from({ length: 15 }, () => 'TD'),
      // the footer: the spanning utility cell and two pinned columns
      'TD',
      'TD',
      'TD'
    ])
    const footerUtility = m.wrapper.find('tfoot td[colspan]')
    expect(footerUtility.attributes('data-pinned')).toBe('')
    expect(
      (footerUtility.element as HTMLElement).style.getPropertyValue(
        '--qt-pin-left'
      )
    ).toBe('0px')
  })

  it('measures again when the observer reports, and disconnects on unmount', async () => {
    const callbacks: ResizeObserverCallback[] = []
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback)
        }
        observe() {
          return undefined
        }
        disconnect = disconnect
      }
    )
    let width = 50
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ width }) as DOMRect
    )
    const m = mountIt({ columns: pinnedColumns() })
    await flush()
    const offset = (field: string) =>
      (
        m.wrapper.find(`thead th[data-field="${field}"]`).element as HTMLElement
      ).style.getPropertyValue('--qt-pin-left')
    expect(offset('joined')).toBe('50px')
    width = 80
    callbacks.at(-1)!([], {} as ResizeObserver)
    await flush()
    expect(offset('joined')).toBe('80px')
    m.wrapper.unmount()
    mounted = null
    expect(disconnect).toHaveBeenCalled()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('marks nothing and writes no offset while no column is pinned', async () => {
    const m = mountIt({ hasSubtable: true, rows: makeRows() })
    await flush()
    expect(m.wrapper.findAll('[data-pinned]')).toHaveLength(0)
    expect(m.wrapper.html()).not.toContain('--qt-pin-left')
  })

  it('follows a column that becomes pinned or stops being pinned', async () => {
    const m = mountIt({ columns: pinnedColumns() })
    await m.wrapper.setProps({
      columns: pinnedColumns().map(column => ({ ...column, pinned: undefined }))
    })
    expect(fieldsOf(m, 'thead th')).toEqual(['id', 'name', 'joined'])
    expect(m.wrapper.findAll('[data-pinned]')).toHaveLength(0)
  })
})
