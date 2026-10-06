import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import {
  type CellContextMenuPayload,
  type Column,
  useQueryTable
} from '@dolusoft/query-table'

import {
  flush,
  makeQuery,
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

describe('C-71 Right pinning [tanstack] [own]', () => {
  const sides = (): Column[] => [
    { field: 'id', title: 'ID', pinned: 'right' },
    { field: 'name', title: 'Name', pinned: 'left' },
    { field: 'age', title: 'Age' },
    { field: 'joined', title: 'Joined', pinned: 'right' }
  ]

  it('draws right-pinned columns last, in their order, with data-pinned="right"', () => {
    const m = mountIt({
      columns: sides(),
      footerRows: [{ cells: [{ field: 'id', text: 1 }] }]
    })
    const order = ['name', 'age', 'id', 'joined']
    expect(fieldsOf(m, 'thead th')).toEqual(order)
    expect(fieldsOf(m, 'tbody tr[data-row-index="0"] td')).toEqual(order)
    expect(fieldsOf(m, 'tfoot td')).toEqual(order)
    for (const selector of [
      'thead th',
      'tbody tr[data-row-index="0"] td',
      'tfoot td'
    ]) {
      expect(
        m.wrapper
          .findAll(selector)
          .map(cell => cell.attributes('data-pinned') ?? null)
      ).toEqual(['', null, 'right', 'right'])
    }
  })

  it('utilities stay in flow when only the right side is pinned', () => {
    const m = mountIt({
      hasSubtable: true,
      hasRightPanel: true,
      columns: [
        { field: 'id', title: 'ID', pinned: 'right' },
        { field: 'name', title: 'Name' }
      ],
      footerRows: [{ cells: [{ field: 'id', text: 1 }] }]
    })
    const utilities = m.wrapper.findAll(
      'thead > tr > :not([data-field]), tbody > tr > td:not([data-field]), tfoot td[colspan]'
    )
    expect(utilities.length).toBeGreaterThan(0)
    expect(
      utilities.every(cell => cell.attributes('data-pinned') === undefined)
    ).toBe(true)
  })

  it('hasPinned of the composable counts only the left side', () => {
    const scope = effectScope()
    const hasPinned = (columns: Column[]) =>
      scope.run(
        () =>
          useQueryTable({
            query: makeQuery(),
            columns,
            onQueryChange: () => {}
          }).hasPinned.value
      )
    expect(hasPinned([{ field: 'a', pinned: 'right' }, { field: 'b' }])).toBe(
      false
    )
    expect(
      hasPinned([
        { field: 'a', pinned: 'right' },
        { field: 'b', pinned: 'left' }
      ])
    ).toBe(true)
    expect(
      hasPinned([{ field: 'a', pinned: 'left', hide: true }, { field: 'b' }])
    ).toBe(false)
    scope.stop()
  })

  it('a hidden right-pinned column is not drawn', () => {
    const m = mountIt({
      columns: [{ field: 'id', pinned: 'right', hide: true }, { field: 'name' }]
    })
    expect(fieldsOf(m, 'thead th')).toEqual(['name'])
    expect(m.wrapper.find('[data-pinned]').exists()).toBe(false)
  })

  it('writes --qt-pin-right from the measured widths, the last cell at 0px', async () => {
    const callbacks: ResizeObserverCallback[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback)
        }
        observe() {
          return undefined
        }
        disconnect() {
          return undefined
        }
      }
    )
    const widths: Record<string, number> = { age: 50, joined: 70 }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return { width: widths[this.dataset.field ?? ''] ?? 30 } as DOMRect
      }
    )
    const m = mountIt({
      columns: [
        { field: 'id', title: 'ID' },
        { field: 'age', title: 'Age', pinned: 'right' },
        { field: 'joined', title: 'Joined', pinned: 'right' }
      ]
    })
    await flush()
    const style = (selector: string) =>
      (m.wrapper.find(selector).element as HTMLElement).style
    const offset = (field: string) =>
      style(`thead th[data-field="${field}"]`).getPropertyValue(
        '--qt-pin-right'
      )
    expect(offset('joined')).toBe('0px')
    expect(offset('age')).toBe('70px')
    expect(
      style(
        'tbody tr[data-row-index="0"] td[data-field="age"]'
      ).getPropertyValue('--qt-pin-right')
    ).toBe('70px')
    expect(m.wrapper.html()).not.toContain('--qt-pin-left')
    widths.joined = 90
    callbacks.at(-1)!([], {} as ResizeObserver)
    await flush()
    expect(offset('age')).toBe('90px')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})
