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

const serverProps = (extra: Record<string, any> = {}) => ({
  totalRows: 50,
  sortable: true,
  columnFilter: true,
  useNewColumnFilter: true,
  showFloatingFilterLabel: true,
  showClearAllButton: true,
  enablefooterpagination: true,
  alwaysShowPagination: true,
  filterDebounce: 0,
  ...extra
})

let wrapper: any
afterEach(() => wrapper?.unmount())

describe('expose: setColumnFilter', () => {
  it('triggerFilter=true → exactly one change (filter) with the value applied', async () => {
    const columns = makeColumns()
    wrapper = mountTable(serverProps({ columns }))
    await flush()
    const ok = wrapper.vm.setColumnFilter('name', 'bob', undefined, true)
    await wait(10)
    await flush()
    expect(ok).toBe(true)
    const events = changeEvents(wrapper)
    expect(events).toHaveLength(1)
    expect(events[0].change_type).toBe('filter')
    expect(columns[1]).toMatchObject({ value: 'bob', condition: 'Contains' })
    expect(columns[1].parsedFilterRules).toBeUndefined()
    // header input is synced from the column
    expect(
      (wrapper.find('th[data-field="name"] input').element as HTMLInputElement)
        .value
    ).toBe('bob')
  })

  it('triggerFilter=false (default) → silent, no change emitted', async () => {
    const columns = makeColumns()
    wrapper = mountTable(serverProps({ columns }))
    await flush()
    wrapper.vm.setColumnFilter('age', '25')
    await wait(10)
    await flush()
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('filterChange')).toBeUndefined()
    expect(columns[2]).toMatchObject({ value: '25', condition: 'Equal' })
  })

  it('explicit condition wins and parsed rules are cleared', async () => {
    const columns = makeColumns()
    columns[1].parsedFilterRules = [{ value: 'x', condition: 'Contains' }]
    wrapper = mountTable(serverProps({ columns }))
    await flush()
    wrapper.vm.setColumnFilter('name', 'x', 'StartsWith', true)
    await wait(10)
    await flush()
    expect(changeEvents(wrapper)).toHaveLength(1)
    expect(columns[1]).toMatchObject({ value: 'x', condition: 'StartsWith' })
    expect(columns[1].parsedFilterRules).toBeUndefined()
  })

  it('unknown field → returns false, emits nothing', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    expect(wrapper.vm.setColumnFilter('nope', 'x', undefined, true)).toBe(false)
    await flush()
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})

describe('expose: clearAllFilters', () => {
  it('server mode: one change (filter, page 1), clears values/conditions and sort', async () => {
    const columns = makeColumns()
    wrapper = mountTable(serverProps({ columns, sortColumn: 'name' }))
    await flush()
    wrapper.vm.setColumnFilter('name', 'bob', 'Equal')
    wrapper.vm.setColumnFilter('age', '3')
    await flush()
    wrapper.vm.clearAllFilters()
    await wait(10)
    await flush()
    const events = changeEvents(wrapper)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      change_type: 'filter',
      current_page: 1,
      sort_column: '',
      sort_direction: ''
    })
    expect(columns.map(c => [c.value, c.condition])).toEqual([
      ['', ''],
      ['', ''],
      ['', ''],
      ['', '']
    ])
  })

  it('clear-all header button → one change', async () => {
    wrapper = mountTable(serverProps({ hasRightPanel: true }))
    await flush()
    wrapper.vm.setColumnFilter('name', 'bob')
    await flush()
    await wrapper.find('button.bh-clear-all-button').trigger('click')
    await wait(10)
    await flush()
    expect(changeEvents(wrapper).map(e => e.change_type)).toEqual(['filter'])
  })
})

describe('expose: flushAllFilterDebounces', () => {
  it('flushes a pending header-input debounce into one change', async () => {
    wrapper = mountTable(serverProps({ filterDebounce: 10000 }))
    await flush()
    await wrapper.find('th[data-field="name"] input').setValue('ali')
    await flush()
    expect(wrapper.emitted('change')).toBeUndefined()
    wrapper.vm.flushAllFilterDebounces()
    await flush()
    expect(changeEvents(wrapper).map(e => e.change_type)).toEqual(['filter'])
    expect(wrapper.vm.getColumnFilters()[1].value).toBe('ali')
  })

  it('no pending debounce → nothing happens', async () => {
    wrapper = mountTable(serverProps())
    await flush()
    wrapper.vm.flushAllFilterDebounces()
    await flush()
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})

describe('expose: getColumnFilters', () => {
  it('returns the live columns prop array with normalized defaults', async () => {
    const columns = makeColumns()
    wrapper = mountTable(serverProps({ columns }))
    await flush()
    const result = wrapper.vm.getColumnFilters()
    expect(result).toHaveLength(4)
    expect(toRaw(result[1])).toBe(columns[1])
    expect(result[1]).toMatchObject({
      type: 'string',
      filter: true,
      sort: true,
      hide: false,
      dataOnly: false,
      condition: ''
    })
  })
})

describe('expose: collapseAll', () => {
  it('collapseAll hides every expanded tsub row', async () => {
    const rows = makeRows().map((r, i) => ({ ...r, isExpanded: i < 2 }))
    wrapper = mountTable(
      { rows, hasSubtable: true },
      { slots: { tsub: '<div class="sub">sub {{ params.rowData.id }}</div>' } }
    )
    await flush()
    expect(wrapper.findAll('.sub').map((s: any) => s.text())).toEqual([
      'sub 1',
      'sub 2'
    ])
    wrapper.vm.collapseAll()
    await flush()
    expect(wrapper.findAll('.sub')).toHaveLength(0)
  })
})

describe('expose: surface', () => {
  it('exposes exactly the methods the consumer calls', async () => {
    wrapper = mountTable()
    await flush()
    for (const name of [
      'getColumnFilters',
      'setColumnFilter',
      'clearAllFilters',
      'collapseAll',
      'flushAllFilterDebounces'
    ]) {
      expect(typeof wrapper.vm[name]).toBe('function')
    }
    for (const name of [
      'reset',
      'getSelectedRows',
      'clearSelectedRows',
      'selectRow',
      'unselectRow',
      'isRowSelected',
      'getFilteredRows'
    ]) {
      expect(wrapper.vm[name]).toBeUndefined()
    }
  })
})
