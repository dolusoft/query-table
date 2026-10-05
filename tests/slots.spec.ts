import { afterEach, describe, expect, it } from 'vitest'

import {
  changeEvents,
  flush,
  makeColumns,
  makeRows,
  mountTable
} from './helpers'

let wrapper: any
afterEach(() => wrapper?.unmount())

describe('slots used by the consumer', () => {
  it('column slot replaces the cell and receives the row as `value`', async () => {
    wrapper = mountTable(
      {},
      {
        slots: {
          name: '<b class="cell">{{ params.value.name }}#{{ params.value.id }}</b>'
        }
      }
    )
    await flush()
    expect(wrapper.findAll('b.cell').map((b: any) => b.text())).toEqual([
      'Charlie#1',
      'alice#2',
      'Bob#3',
      'Dave#4',
      'Eve#5'
    ])
  })

  it('tsub receives only rowData for expanded rows', async () => {
    const rows = makeRows().map((r, i) => ({ ...r, isExpanded: i === 1 }))
    wrapper = mountTable(
      { rows, hasSubtable: true },
      {
        slots: {
          tsub: '<i class="sub">{{ params.rowData.id }}/{{ Object.keys(params).join() }}</i>'
        }
      }
    )
    await flush()
    expect(wrapper.findAll('i.sub').map((s: any) => s.text())).toEqual([
      '2/rowData'
    ])
  })

  it('current behavior: clicks inside a body row have their default prevented', async () => {
    wrapper = mountTable(
      {},
      {
        slots: { name: '<a class="lnk" href="#x">{{ params.value.name }}</a>' }
      }
    )
    await flush()
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    wrapper.find('a.lnk').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('tableactionheader renders', async () => {
    wrapper = mountTable(
      {},
      { slots: { tableactionheader: '<div class="action">ACT</div>' } }
    )
    await flush()
    expect(wrapper.find('.action').text()).toBe('ACT')
  })

  it('footerpageinfo / footerpagination receive paging state and callbacks', async () => {
    wrapper = mountTable(
      {
        totalRows: 50,
        enablefooterpagination: true,
        alwaysShowPagination: true
      },
      {
        slots: {
          footerpageinfo:
            '<button class="ps" @click="params.setPageSize(20)">{{ params.showPageSize }}|{{ params.pageSizeOptions.join(",") }}|{{ params.currentPageSize }}</button>',
          footerpagination:
            '<button class="nxt" @click="params.nextPage()">{{ params.currentPage }}/{{ params.maxPage }}</button>' +
            '<button class="prv" @click="params.previousPage()">prev</button>'
        }
      }
    )
    await flush()
    expect(wrapper.find('.ps').text()).toBe('true|10,20,30,50,100|10')
    expect(wrapper.find('.nxt').text()).toBe('1/5')
    await wrapper.find('.nxt').trigger('click')
    await flush()
    expect(changeEvents(wrapper)[0]).toMatchObject({
      current_page: 2,
      change_type: 'page'
    })
    expect(wrapper.find('.nxt').text()).toBe('2/5')
    await wrapper.find('.prv').trigger('click')
    await flush()
    expect(wrapper.find('.nxt').text()).toBe('1/5')
    await wrapper.find('.ps').trigger('click')
    await flush()
    expect(wrapper.find('.ps').text()).toBe('true|10,20,30,50,100|20')
    expect(wrapper.find('.nxt').text()).toBe('1/3')
    expect(changeEvents(wrapper).at(-1)).toMatchObject({
      pagesize: 20,
      change_type: 'pagesize'
    })
  })

  it('footer slots are not rendered without enablefooterpagination', async () => {
    wrapper = mountTable(
      {},
      {
        slots: {
          footerpageinfo: '<span class="info">x</span>',
          footerpagination: '<span class="pg">x</span>'
        }
      }
    )
    await flush()
    expect(wrapper.find('.info').exists()).toBe(false)
    expect(wrapper.find('.pg').exists()).toBe(false)
  })

  it('nodatacontent renders when there are no rows', async () => {
    wrapper = mountTable(
      { rows: [], totalRows: 0 },
      { slots: { nodatacontent: '<p class="empty">EMPTY</p>' } }
    )
    await flush()
    expect(wrapper.find('p.empty').text()).toBe('EMPTY')
  })

  it('nodatacontent has no fallback text', async () => {
    wrapper = mountTable({ rows: [], totalRows: 0 })
    await flush()
    expect(wrapper.find('.nodatacontent').text()).toBe('')
  })

  it('nodatacontent is hidden while loading', async () => {
    wrapper = mountTable({ rows: [], totalRows: 0, loading: true })
    await flush()
    expect(wrapper.find('.nodatacontent').exists()).toBe(false)
  })

  it('filter-datetime replaces the date input and updateValue drives a filter change', async () => {
    const columns = [
      ...makeColumns(),
      { field: 'ts', title: 'TS', type: 'DateTime' }
    ]
    wrapper = mountTable(
      {
        columns,
        totalRows: 5,
        columnFilter: true,
        useNewColumnFilter: true,
        showFloatingFilterLabel: true,
        filterDebounce: 0
      },
      {
        slots: {
          'filter-datetime':
            '<button class="dt" :data-col="params.column.field" @click="params.updateValue(\'2024-01-01T00:00:00.000Z\')">{{ params.value }}</button>'
        }
      }
    )
    await flush()
    const buttons = wrapper.findAll('button.dt')
    // date and datetime columns both use the slot
    expect(buttons.map((b: any) => b.attributes('data-col'))).toEqual([
      'joined',
      'ts'
    ])
    expect(
      wrapper.find('th[data-field="ts"] input[type="date"]').exists()
    ).toBe(false)
    await buttons[1].trigger('click')
    await new Promise(r => setTimeout(r, 10))
    await flush()
    const events = changeEvents(wrapper)
    expect(events).toHaveLength(1)
    expect(events[0].change_type).toBe('filter')
    const ts = events[0].column_filters.find((c: any) => c.field === 'ts')
    // type is lower-cased at setup; non-text types default to Equal
    expect(ts).toMatchObject({
      type: 'datetime',
      value: '2024-01-01T00:00:00.000Z',
      condition: 'Equal'
    })
    expect(wrapper.find('th[data-field="ts"] button.dt').text()).toBe(
      '2024-01-01T00:00:00.000Z'
    )
  })
})

describe('header cells', () => {
  it('every visible column th carries data-field', async () => {
    const columns = [
      ...makeColumns(),
      { field: 'hidden', hide: true },
      { field: 'dataonly', dataOnly: true }
    ]
    wrapper = mountTable({
      columns,
      hasSubtable: true,
      hasRightPanel: true
    })
    await flush()
    expect(
      wrapper
        .findAll('thead th')
        .map((th: any) => th.attributes('data-field') ?? null)
    ).toEqual([null, null, 'id', 'name', 'age', 'joined'])
    expect(wrapper.find('th[data-field="name"]').text()).toContain('Name')
    expect(wrapper.find('tfoot').exists()).toBe(false)
  })
})
