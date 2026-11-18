import type * as protocolLocal from '@dolusoft/query-protocol/local'
import {
  applyQuery,
  defineDataset,
  type Dataset,
  type LocalQueryError
} from '@dolusoft/query-protocol/local'
import { DataTable } from '@dolusoft/query-table/data-table'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, toRaw, type Component } from 'vue'

import QueryTable, {
  type Column,
  type HeaderSlotProps,
  type PaginationSlotProps,
  type QueryTableExpose,
  type TableQuery
} from '@dolusoft/query-table'

// The dataset the table builds goes through this spy, so a test can count
// how often it is built (C-126).
vi.mock('@dolusoft/query-protocol/local', async importOriginal => {
  const original = await importOriginal<typeof protocolLocal>()
  return { ...original, defineDataset: vi.fn(original.defineDataset) }
})

interface Person {
  id: number
  name: string
  age: number
  city: string
  address?: string
}

const people: Person[] = [
  { id: 1, name: 'Charlie', age: 30, city: 'Ankara' },
  { id: 2, name: 'alice', age: 25, city: 'İzmir' },
  { id: 3, name: 'Bob', age: 40, city: 'Ankara' },
  { id: 4, name: 'Dave', age: 25, city: 'Bursa' },
  { id: 5, name: 'Eve', age: 35, city: 'Alicante' },
  { id: 6, name: 'Ali', age: 50, city: 'Bursa' }
]

const makeColumns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'integer' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'integer' },
  { field: 'city', title: 'City', hide: true }
]

const query = (overrides: Partial<TableQuery> = {}): TableQuery => ({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: [],
  ...overrides
})

/** The dataset C-126 describes for `makeColumns()`, every field queryable. */
const expectedDataset = defineDataset<Person>({
  key: 'id',
  fields: {
    id: { type: 'integer' },
    name: { type: 'string', search: true },
    age: { type: 'integer' },
    city: { type: 'string' }
  }
})

const evaluate = (
  q: TableQuery,
  dataset: Dataset<Person> = expectedDataset
) => {
  const result = applyQuery(people, q, dataset, { profile: 'tr-2' })
  if (!result.ok) {
    throw new Error(result.error.code)
  }
  return result
}

let wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  wrappers = []
})
beforeEach(() => {
  vi.mocked(defineDataset).mockClear()
})

interface Box {
  pagination: PaginationSlotProps | null
}

/** Mounts a DataTable whose `pagination` slot hands its props to the test. */
const mountData = (
  props: Record<string, unknown> = {},
  slots: Record<string, unknown> = {}
) => {
  const box: Box = { pagination: null }
  const wrapper = mount(DataTable as unknown as Component, {
    props: { columns: makeColumns(), rows: people, rowKey: 'id', ...props },
    slots: {
      pagination: (slot: PaginationSlotProps) => {
        box.pagination = slot
        return h('i', { class: 'paged' })
      },
      ...slots
    }
  }) as VueWrapper
  wrappers.push(wrapper)
  return { wrapper, box }
}

const ids = (wrapper: VueWrapper) =>
  wrapper.findAll('tbody td[data-field="id"]').map(cell => Number(cell.text()))

/** A prop as the inner QueryTable received it. */
const innerProp = (wrapper: VueWrapper, name: string): unknown =>
  (
    wrapper.findComponent(QueryTable as unknown as Component).props() as Record<
      string,
      unknown
    >
  )[name]

const silenceErrors = () =>
  vi.spyOn(console, 'error').mockImplementation(() => {})

describe('C-124 DataTable: the rows it draws', () => {
  it('draws the page the evaluator gives, with its total', () => {
    const q = query({
      pageSize: 2,
      page: 2,
      sort: { field: 'age', direction: 'desc' },
      filters: [{ field: 'age', condition: 'GreaterThan', value: 25 }]
    })
    const { wrapper, box } = mountData({
      query: q,
      sortable: true,
      filterable: true
    })
    const expected = evaluate(q)
    expect(ids(wrapper)).toEqual(expected.rows.map(row => row.id))
    expect(box.pagination?.totalRows).toBe(expected.totalRows)
    expect(box.pagination?.totalRows).toBe(4)
  })

  it('passes what the consumer gives and leaves the rest out', async () => {
    const { wrapper } = mountData({ class: 'mine' })
    // `header` left out: QueryTable's own default (true) draws it.
    expect(wrapper.find('thead').exists()).toBe(true)
    expect(wrapper.find('.qt-datatable').classes()).toContain('mine')
    // No cellContextMenu listener: the browser menu is kept.
    const first = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    })
    wrapper.find('tbody td[data-field="name"]').element.dispatchEvent(first)
    expect(first.defaultPrevented).toBe(false)

    const onCellContextMenu = vi.fn()
    await wrapper.setProps({ header: false, onCellContextMenu })
    expect(wrapper.find('thead').exists()).toBe(false)
    const second = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    })
    wrapper.find('tbody td[data-field="name"]').element.dispatchEvent(second)
    expect(second.defaultPrevented).toBe(true)
    expect(onCellContextMenu).toHaveBeenCalledOnce()
  })

  it('gives the flash a snapshot for a new context and live for a new source', async () => {
    const { wrapper } = mountData({ query: query({ pageSize: 3 }) })
    const hint = () => innerProp(wrapper, 'rowsUpdate')
    expect(hint()).toBe('snapshot')
    await wrapper.setProps({ rows: [...people, { ...people[0], id: 7 }] })
    expect(hint()).toBe('live')
    await wrapper.setProps({ query: query({ pageSize: 3, page: 2 }) })
    expect(hint()).toBe('snapshot')
    await wrapper.setProps({ rows: people })
    expect(hint()).toBe('live')
    await wrapper.setProps({ paginate: false })
    expect(hint()).toBe('snapshot')
  })

  it('draws the error slot while the evaluator reports an error, else empty', async () => {
    silenceErrors()
    const bad = query({
      filters: [{ field: 'nope', condition: 'Equal', value: 'x' }]
    })
    const seen: LocalQueryError[] = []
    const { wrapper, box } = mountData(
      { query: bad },
      {
        error: ({ error }: { error: LocalQueryError }) => {
          seen.push(error)
          return h('b', { class: 'bad' }, error.code)
        },
        empty: () => h('i', { class: 'none' })
      }
    )
    expect(ids(wrapper)).toEqual([])
    expect(box.pagination).toBeNull()
    expect(innerProp(wrapper, 'totalRows')).toBe(0)
    expect(wrapper.find('.qt-empty-row .bad').text()).toBe('unknown-field')
    expect(wrapper.find('.none').exists()).toBe(false)
    expect(seen.at(-1)?.field).toBe('nope')

    const { wrapper: plain } = mountData(
      { query: bad },
      { empty: () => h('i', { class: 'none' }) }
    )
    expect(plain.find('.qt-empty-row .none').exists()).toBe(true)

    // Without an error the empty slot is the consumer's again.
    await wrapper.setProps({
      query: query({
        filters: [{ field: 'age', condition: 'Equal', value: 99 }]
      }),
      filterable: true
    })
    expect(wrapper.find('.qt-empty-row .none').exists()).toBe(true)
    expect(wrapper.find('.bad').exists()).toBe(false)
  })

  it('passes an attribute that is not a prop under the name it was given', () => {
    const { wrapper } = mountData({
      'data-testid': 'people',
      'aria-label': 'People',
      id: 'list'
    })
    const root = wrapper.find('.qt-datatable')
    expect(root.attributes('data-testid')).toBe('people')
    expect(root.attributes('aria-label')).toBe('People')
    expect(root.attributes('id')).toBe('list')
    expect(root.attributes('datatestid')).toBeUndefined()
  })

  it('calls a .once listener of update:query once', async () => {
    const once = vi.fn()
    const { wrapper, box } = mountData({
      pagination: { pageSizeOptions: [2] },
      'onUpdate:queryOnce': once
    })
    box.pagination!.nextPage()
    await nextTick()
    box.pagination!.nextPage()
    await nextTick()
    expect(once).toHaveBeenCalledOnce()
    expect(wrapper.emitted('update:query')).toHaveLength(2)
  })

  it('compares the query by value for the flash hint', async () => {
    const { wrapper } = mountData({ query: query({ pageSize: 3 }) })
    await wrapper.setProps({
      query: query({ pageSize: 3 }),
      rows: [...people, { ...people[0], id: 7 }]
    })
    expect(innerProp(wrapper, 'rowsUpdate')).toBe('live')
  })

  it('draws every match and no pagination block with paginate false', () => {
    const { wrapper, box } = mountData({
      query: query({ pageSize: 2 }),
      paginate: false
    })
    expect(ids(wrapper)).toEqual([1, 2, 3, 4, 5, 6])
    expect(box.pagination).toBeNull()
    expect(wrapper.find('.paged').exists()).toBe(false)
  })

  it('has the props and events of QueryTable with the listed difference', () => {
    const table = QueryTable as unknown as {
      props: Record<string, unknown>
      emits: string[]
    }
    const data = DataTable as unknown as typeof table
    const omitted = ['totalRows', 'cursors', 'infinite', 'rowsUpdate']
    const added = ['profile', 'search', 'paginate', 'dataset']
    expect(Object.keys(data.props).sort()).toEqual(
      [
        ...Object.keys(table.props).filter(name => !omitted.includes(name)),
        ...added
      ].sort()
    )
    expect([...data.emits].sort()).toEqual([...table.emits].sort())
  })

  it('exposes the methods of QueryTable', async () => {
    const { wrapper } = mountData(
      { query: query({ pageSize: 2 }), hasSubtable: true },
      { subtable: () => h('i', { class: 'sub' }) }
    )
    const vm = wrapper.vm as unknown as QueryTableExpose
    for (const name of [
      'collapseAll',
      'expandAll',
      'focusFilter',
      'flushPendingFilters',
      'scrollToIndex',
      'loadMore',
      'measureColumnWidths'
    ] as const) {
      expect(typeof vm[name], name).toBe('function')
    }
    vm.expandAll()
    await nextTick()
    expect(wrapper.findAll('.sub')).toHaveLength(2)
    vm.collapseAll()
    await nextTick()
    expect(wrapper.findAll('.sub')).toHaveLength(0)
    expect(vm.focusFilter('name')).toBe(false)
    // The rest reach QueryTable too: no throw, its own answers.
    vm.flushPendingFilters()
    vm.scrollToIndex(0)
    vm.loadMore()
    expect(typeof vm.measureColumnWidths(['name'])).toBe('object')
    expect(wrapper.emitted('update:query')).toBeUndefined()
  })
})

describe('C-125 DataTable: the query it holds', () => {
  it('holds the query when none is given and applies its own updates', async () => {
    const { wrapper, box } = mountData({
      pagination: { pageSizeOptions: [2, 4] }
    })
    expect(ids(wrapper)).toEqual([1, 2])
    expect(box.pagination?.page).toBe(1)
    box.pagination!.nextPage()
    await nextTick()
    const events = wrapper.emitted('update:query') ?? []
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual([query({ page: 2, pageSize: 2 }), 'page'])
    expect(ids(wrapper)).toEqual([3, 4])
  })

  it('follows pageSizeOptions that arrive later until the first update', async () => {
    const { wrapper, box } = mountData()
    expect(box.pagination?.pageSize).toBe(10)
    await wrapper.setProps({ pagination: { pageSizeOptions: [2, 4] } })
    expect(box.pagination?.pageSize).toBe(2)
    expect(ids(wrapper)).toEqual([1, 2])
    box.pagination!.nextPage()
    await nextTick()
    await wrapper.setProps({ pagination: { pageSizeOptions: [3] } })
    expect(box.pagination?.pageSize).toBe(2)
    expect(box.pagination?.page).toBe(2)
  })

  it('starts at ten rows without pageSizeOptions', () => {
    const { box } = mountData()
    expect(box.pagination?.pageSize).toBe(10)
  })

  it('leaves a given query to the consumer', async () => {
    const { wrapper, box } = mountData({ query: query({ pageSize: 2 }) })
    box.pagination!.nextPage()
    await nextTick()
    expect(wrapper.emitted('update:query')).toHaveLength(1)
    expect(ids(wrapper)).toEqual([1, 2])
  })

  it('uses a query given later and starts again when it is taken away', async () => {
    const { wrapper, box } = mountData({
      pagination: { pageSizeOptions: [2] }
    })
    box.pagination!.nextPage()
    await nextTick()
    expect(ids(wrapper)).toEqual([3, 4])
    await wrapper.setProps({ query: query({ pageSize: 2, page: 3 }) })
    expect(ids(wrapper)).toEqual([5, 6])
    await wrapper.setProps({ query: undefined })
    expect(ids(wrapper)).toEqual([1, 2])
  })

  it('does not correct a page past the end', () => {
    const { wrapper } = mountData({ query: query({ pageSize: 2, page: 9 }) })
    expect(ids(wrapper)).toEqual([])
  })
})

describe('C-126 DataTable: the dataset from the columns', () => {
  it('makes a field of every column, hidden ones included', () => {
    const q = query({
      sort: { field: 'name', direction: 'asc' },
      filters: [{ field: 'city', condition: 'Equal', value: 'Bursa' }]
    })
    const { wrapper } = mountData({
      query: q,
      sortable: true,
      filterable: true
    })
    expect(ids(wrapper)).toEqual(evaluate(q).rows.map(row => row.id))
    expect(ids(wrapper)).toEqual([6, 4])
    const dataset = vi.mocked(defineDataset).mock.calls[0][0]
    expect(dataset.key).toBe('id')
    expect({ ...dataset.fields }).toEqual({
      id: { type: 'integer', sortable: true, filterable: true },
      name: { type: 'string', sortable: true, filterable: true },
      age: { type: 'integer', sortable: true, filterable: true },
      city: { type: 'string', sortable: true, filterable: true }
    })
  })

  it('keeps sorting and filtering to what the table and the column allow', () => {
    silenceErrors()
    const columns = makeColumns()
    columns[2] = { ...columns[2], sortable: false, filterable: false }
    const codes: string[] = []
    const onError = ({ error }: { error: LocalQueryError }) => {
      codes.push(`${error.code}:${error.field}`)
      return null
    }
    mountData(
      { query: query({ sort: { field: 'name', direction: 'asc' } }) },
      { error: onError }
    )
    mountData(
      {
        columns,
        sortable: true,
        query: query({ sort: { field: 'age', direction: 'asc' } })
      },
      { error: onError }
    )
    mountData(
      {
        columns,
        filterable: true,
        query: query({
          filters: [{ field: 'age', condition: 'Equal', value: 25 }]
        })
      },
      { error: onError }
    )
    expect(codes).toEqual([
      'unsupported-field:name',
      'unsupported-field:age',
      'unsupported-field:age'
    ])
  })

  it('searches the fields named in search only', () => {
    const { wrapper } = mountData({
      search: ['name'],
      query: query({ search: 'ali' })
    })
    // "Alicante" is a city, not a name.
    expect(ids(wrapper)).toEqual([2, 6])
  })

  it('reads the column type as the table does and leaves ip columns out', () => {
    const columns: Column[] = [
      ...makeColumns().map(column =>
        column.field === 'age'
          ? { ...column, type: 'INTEGER' as Column['type'] }
          : column
      ),
      { field: 'address', type: 'ip' },
      { field: 'name', title: 'Name again', type: 'integer' }
    ]
    mountData({ columns })
    const dataset = vi.mocked(defineDataset).mock.calls[0][0]
    expect(Object.keys(dataset.fields).sort()).toEqual([
      'age',
      'city',
      'id',
      'name'
    ])
    expect(dataset.fields.age.type).toBe('integer')
    expect(dataset.fields.name.type).toBe('string')
  })

  it('builds the dataset again only when what it reads changes', async () => {
    const { wrapper } = mountData({ sortable: true })
    expect(defineDataset).toHaveBeenCalledTimes(1)
    const columns = makeColumns()
    await wrapper.setProps({
      columns: [
        { ...columns[1], title: 'Full name', width: '200px' },
        columns[0],
        { ...columns[2], hide: true },
        columns[3]
      ]
    })
    expect(defineDataset).toHaveBeenCalledTimes(1)
    await wrapper.setProps({
      columns: [...columns.slice(0, 3), { ...columns[3], sortable: false }]
    })
    expect(defineDataset).toHaveBeenCalledTimes(2)
    await wrapper.setProps({ search: ['city'] })
    expect(defineDataset).toHaveBeenCalledTimes(3)
    await wrapper.setProps({ search: ['city'] })
    expect(defineDataset).toHaveBeenCalledTimes(3)
  })

  it('uses a dataset prop whole', () => {
    silenceErrors()
    const dataset = defineDataset<Person>({
      key: 'id',
      fields: {
        id: { type: 'integer' },
        city: { type: 'string', search: true }
      }
    })
    vi.mocked(defineDataset).mockClear()
    const codes: string[] = []
    const { wrapper } = mountData({
      dataset,
      query: query({ search: 'bur' })
    })
    expect(defineDataset).not.toHaveBeenCalled()
    expect(ids(wrapper)).toEqual([4, 6])
    mountData(
      { dataset, query: query({ sort: { field: 'name', direction: 'asc' } }) },
      {
        error: ({ error }: { error: LocalQueryError }) => {
          codes.push(error.code)
          return null
        }
      }
    )
    expect(codes).toEqual(['unknown-field'])
  })

  it('throws a TypeError for a key or a search field the columns do not give', () => {
    silenceErrors()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => mountData({ rowKey: 'nope' })).toThrow(TypeError)
    expect(() => mountData({ search: ['nope'] })).toThrow(
      'the search field "nope" is not a column'
    )
    expect(() => mountData({ search: ['age'] })).toThrow(TypeError)
    const nested: Column[] = [
      ...makeColumns(),
      { field: 'meta.id', type: 'integer' }
    ]
    expect(() => mountData({ columns: nested, rowKey: 'meta.id' })).toThrow(
      'the rowKey "meta.id" is not a top-level field'
    )
    const withIp: Column[] = [
      ...makeColumns(),
      { field: 'address', type: 'ip' }
    ]
    expect(() => mountData({ columns: withIp, search: ['address'] })).toThrow(
      'the search field "address" is an ip column'
    )
  })

  it('draws an ip column without sort and filter, and gives its own flags back', async () => {
    const columns: Column[] = [
      ...makeColumns(),
      { field: 'address', title: 'Address', type: 'ip' }
    ]
    let hide: (() => void) | null = null
    const { wrapper } = mountData(
      { columns, sortable: true, filterable: true },
      {
        'header-address': ({ control }: HeaderSlotProps) => {
          hide = control.hide
          return 'Address'
        }
      }
    )
    const header = (field: string) => wrapper.find(`th[data-field="${field}"]`)
    expect(header('name').attributes('data-sortable')).toBeDefined()
    expect(header('address').attributes('data-sortable')).toBeUndefined()
    // id, name and age; city is hidden.
    expect(wrapper.findAll('input.qt-filter-input').length).toBe(3)
    expect(
      wrapper.find('[data-field="address"] input.qt-filter-input').exists()
    ).toBe(false)

    hide!()
    await nextTick()
    const [next] = wrapper.emitted('update:columns')![0] as [Column[]]
    expect(
      next.slice(0, 4).every((column, i) => toRaw(column) === columns[i])
    ).toBe(true)
    expect(next[4]).toEqual({
      field: 'address',
      title: 'Address',
      type: 'ip',
      hide: true
    })
  })
})

describe('C-127 DataTable: the DOM of QueryTable', () => {
  it('renders the markup QueryTable renders for the same page', () => {
    const q = query({
      pageSize: 3,
      page: 2,
      sort: { field: 'name', direction: 'asc' }
    })
    const shared = {
      columns: makeColumns(),
      rowKey: 'id',
      sortable: true,
      filterable: true,
      hasSubtable: true,
      selection: { 4: true },
      pagination: { pageSizeOptions: [3, 6] }
    }
    const slots = {
      pagination: (slot: PaginationSlotProps) =>
        h('i', `${slot.page}/${slot.pageCount}`),
      empty: () => h('i', 'none')
    }
    const page = evaluate(q)
    const table = mount(QueryTable as unknown as Component, {
      props: {
        ...shared,
        query: q,
        rows: page.rows,
        totalRows: page.totalRows
      },
      slots
    }) as VueWrapper
    const data = mount(DataTable as unknown as Component, {
      props: { ...shared, query: q, rows: people },
      slots
    }) as VueWrapper
    wrappers.push(table, data)
    expect(data.html()).toBe(table.html())
  })
})
