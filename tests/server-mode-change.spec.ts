import { afterEach, describe, expect, it } from 'vitest'

import { toRaw } from 'vue'

import {
  changeEvents,
  flush,
  makeColumns,
  makeRows,
  mountTable
} from './helpers'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

const choosePageSize = async (wrapper: any, size: number) => {
  const option = wrapper
    .findAll('select.bh-pagesize option')
    .find((o: any) => o.text() === String(size))
  await option.setSelected()
}

// Mirrors the props the consumer passes in server mode.
const serverProps = (extra: Record<string, any> = {}) => ({
  totalRows: 50,
  page: 1,
  pageSize: 10,
  sortable: true,
  sortColumn: 'id',
  sortDirection: 'asc',
  columnFilter: true,
  useNewColumnFilter: true,
  showFloatingFilterLabel: true,
  showClearAllButton: true,
  enablefooterpagination: true,
  alwaysShowPagination: true,
  filterDebounce: 0,
  ...extra
})

const PAYLOAD_KEYS = [
  'current_page',
  'pagesize',
  'offset',
  'sort_column',
  'sort_direction',
  'search',
  'column_filters',
  'change_type'
]

let wrapper: any
afterEach(() => wrapper?.unmount())

describe('server mode — change event payload', () => {
  it('nothing is emitted on mount', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('page: next-page button', async () => {
    const columns = makeColumns()
    wrapper = mountTable(serverProps({ columns }))
    await flush()
    await wrapper.find('button.next-page').trigger('click')
    await flush()
    const events = changeEvents(wrapper)
    expect(events).toHaveLength(1)
    expect(Object.keys(events[0])).toEqual(PAYLOAD_KEYS)
    expect(events[0]).toMatchObject({
      current_page: 2,
      pagesize: 10,
      offset: 10,
      sort_column: 'id',
      sort_direction: 'asc',
      search: '',
      change_type: 'page'
    })
    // column_filters is the live columns prop array, not a copy
    expect(toRaw(events[0].column_filters)).toBe(columns)
  })

  it('page: nextPage stops at maxPage, previousPage at page 1', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    for (let i = 0; i < 5; i++) {
      await wrapper.find('button.next-page').trigger('click')
      await flush()
    }
    const events = changeEvents(wrapper)
    expect(events).toHaveLength(4)
    expect(events.at(-1)).toMatchObject({
      current_page: 5,
      offset: 40,
      change_type: 'page'
    })
    for (let i = 0; i < 5; i++) {
      await wrapper.find('button.previous-page').trigger('click')
      await flush()
    }
    expect(changeEvents(wrapper)).toHaveLength(8)
    expect(changeEvents(wrapper).at(-1)).toMatchObject({ current_page: 1 })
  })

  it('pagesize: page-size select on page 1', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    await choosePageSize(wrapper, 20)
    await flush()
    const events = changeEvents(wrapper)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      current_page: 1,
      pagesize: 20,
      offset: 0,
      change_type: 'pagesize'
    })
  })

  it('current behavior: pagesize change on page > 1 is reported as change_type "page"', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    await wrapper.find('button.next-page').trigger('click')
    await flush()
    await choosePageSize(wrapper, 20)
    await flush()
    const events = changeEvents(wrapper)
    expect(events.map(e => e.change_type)).toEqual(['page', 'page'])
    expect(events[1]).toMatchObject({ current_page: 1, pagesize: 20 })
  })

  it('sort: header click toggles asc → desc on the current sort column', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    await wrapper.find('th[data-field="id"] > div').trigger('click')
    await flush()
    expect(changeEvents(wrapper).at(-1)).toMatchObject({
      sort_column: 'id',
      sort_direction: 'desc',
      current_page: 1,
      change_type: 'sort'
    })
  })

  it('sort: header click on another column starts asc; page is kept', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    await wrapper.find('button.next-page').trigger('click')
    await flush()
    await wrapper.find('th[data-field="name"] > div').trigger('click')
    await flush()
    const last = changeEvents(wrapper).at(-1)
    expect(last).toMatchObject({
      sort_column: 'name',
      sort_direction: 'asc',
      // current behavior: sorting does not reset the page
      current_page: 2,
      offset: 10,
      change_type: 'sort'
    })
  })

  it('sort: non-sortable table ignores header clicks', async () => {
    wrapper = mountTable(serverProps({ sortable: false }))
    await flush()
    await wrapper.find('th[data-field="name"] > div').trigger('click')
    await flush()
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('filter: typing in a text column filter emits once with Contains', async () => {
    const columns = makeColumns()
    wrapper = mountTable(serverProps({ columns }))
    await flush()
    await wrapper.find('th[data-field="name"] input').setValue('ali')
    await wait(10)
    await flush()
    const events = changeEvents(wrapper)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ current_page: 1, change_type: 'filter' })
    const col = events[0].column_filters.find((c: any) => c.field === 'name')
    expect(col).toMatchObject({ value: 'ali', condition: 'Contains' })
    expect(col.parsedFilterRules).toBeUndefined()
  })

  // current behavior (likely bug): when an operator shortcut is entered into
  // the header input, the immediate block in column-header.vue writes
  // column.condition synchronously; the "external column value" watch then sees
  // column.value ('') differ from the input, treats it as an external change and
  // resets the input to '' with the syncedFromProps flag set. The pending
  // debounce is cancelled and no change is emitted.
  it.each(['!*foo*,bar*', '*foo*', 'foo*', '!foo'])(
    'current behavior: operator shortcut %s typed in the header input is wiped and nothing is emitted',
    async value => {
      const columns = makeColumns()
      wrapper = mountTable(serverProps({ columns }))
      await flush()
      const input = wrapper.find('th[data-field="name"] input')
      await input.setValue(value)
      await wait(10)
      await flush()
      expect(wrapper.emitted('change')).toBeUndefined()
      expect((input.element as HTMLInputElement).value).toBe('')
      expect(columns[1].value).toBeUndefined()
      // the detected condition stays on the column
      expect(columns[1].condition).not.toBe('')
    }
  )

  it('filter: number column defaults to Equal', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    await wrapper.find('th[data-field="age"] input').setValue('25')
    await wait(10)
    await flush()
    const col = changeEvents(wrapper)[0].column_filters.find(
      (c: any) => c.field === 'age'
    )
    expect(col).toMatchObject({ value: 25, condition: 'Equal' })
  })

  it('filter: Enter flushes a pending debounce immediately', async () => {
    wrapper = mountTable(serverProps({ filterDebounce: 10000 }))
    await flush()
    const input = wrapper.find('th[data-field="name"] input')
    await input.setValue('ali')
    await flush()
    expect(wrapper.emitted('change')).toBeUndefined()
    await input.trigger('keydown', { key: 'Enter' })
    await flush()
    expect(changeEvents(wrapper).map(e => e.change_type)).toEqual(['filter'])
  })

  it('filter: clearing the input emits immediately', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    const input = wrapper.find('th[data-field="name"] input')
    await input.setValue('ali')
    await wait(10)
    await input.setValue('')
    await flush()
    const events = changeEvents(wrapper)
    expect(events).toHaveLength(2)
    const col = events[1].column_filters.find((c: any) => c.field === 'name')
    expect(col.value).toBe('')
    // current behavior: clearing the input preserves the condition
    expect(col.condition).toBe('Contains')
  })

  it('current behavior: filter change on page > 1 is reported as change_type "page"', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    await wrapper.find('button.next-page').trigger('click')
    await flush()
    await wrapper.find('th[data-field="name"] input').setValue('ali')
    await wait(10)
    await flush()
    const events = changeEvents(wrapper)
    expect(events.map(e => e.change_type)).toEqual(['page', 'page'])
    expect(events[1]).toMatchObject({ current_page: 1, offset: 0 })
  })

  it('search: search prop change on page 1', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    await wrapper.setProps({ search: 'bob' })
    await flush()
    const events = changeEvents(wrapper)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      search: 'bob',
      current_page: 1,
      change_type: 'search'
    })
  })

  it('setDefaultCondition fills a missing condition before emitting', async () => {
    const columns = makeColumns()
    wrapper = mountTable(serverProps({ columns }))
    await flush()
    columns[1].value = 'x'
    columns[3].value = '2024-01-01'
    await wrapper.find('button.next-page').trigger('click')
    await flush()
    expect(columns[1].condition).toBe('Contains')
    expect(columns[3].condition).toBe('Equal')
  })
})

describe('server mode — rows, totalRows and page props', () => {
  it('renders rows as given, without client filtering/sorting/paging', async () => {
    const rows = makeRows()
    wrapper = mountTable(serverProps({ rows, pageSize: 2, sortColumn: 'name' }))
    await flush()
    expect(wrapper.findAll('tbody tr')).toHaveLength(5)
    expect(rows.map(r => r.id)).toEqual([1, 2, 3, 4, 5])
  })

  it('current behavior: totalRows 0/null hides the rows and shows nodatacontent', async () => {
    wrapper = mountTable(serverProps({ totalRows: null }))
    await flush()
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    expect(wrapper.find('.nodatacontent').exists()).toBe(true)
  })

  it('maxPage comes from totalRows and follows it', async () => {
    wrapper = mountTable(serverProps({ totalRows: 123 }))
    await flush()
    expect(wrapper.find('.page-state').text()).toBe('1/13')
    await wrapper.setProps({ totalRows: 40 })
    await flush()
    expect(wrapper.find('.page-state').text()).toBe('1/4')
  })

  it('current behavior: page / pageSize props are read only once at setup', async () => {
    wrapper = mountTable(serverProps({ page: 3 }))
    await flush()
    await wrapper.setProps({ page: 1, pageSize: 50 })
    await flush()
    expect(wrapper.emitted('change')).toBeUndefined()
    await wrapper.find('button.next-page').trigger('click')
    await flush()
    expect(changeEvents(wrapper)[0]).toMatchObject({
      current_page: 4,
      pagesize: 10
    })
  })

  it('current behavior: sortColumn / sortDirection props are read only once at setup', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    await wrapper.setProps({ sortColumn: 'name', sortDirection: 'desc' })
    await wrapper.find('button.next-page').trigger('click')
    await flush()
    expect(changeEvents(wrapper)[0]).toMatchObject({
      sort_column: 'id',
      sort_direction: 'asc'
    })
  })

  it('rows prop change does not emit change and does not reset the page', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    await wrapper.find('button.next-page').trigger('click')
    await flush()
    await wrapper.setProps({ rows: makeRows().slice(0, 2) })
    await flush()
    expect(changeEvents(wrapper)).toHaveLength(1)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })
})
