import { defineDataset } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from '@dolusoft/query-table/local'
import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref, shallowRef } from 'vue'

import {
  QueryTable,
  type PaginationSlotProps,
  type Query,
  type QueryChangeReason,
  type TableQuery,
  type ToolbarSlotProps
} from '@dolusoft/query-table'

import TablePager from '../../apps/playground/harness/TablePager.vue'
import { makeQuery, rule } from '../support/fixtures'
import { expectUpdates, type ScenarioUpdate } from '../support/scenario-host'
import { traceUpdate } from '../support/trace'

// A page that holds all its rows and evaluates the query itself with
// `useLocalQuery` and the `tr-1` profile: a user searches with Turkish
// capitals, sorts by name, filters a city and pages; then the data turns
// invalid and is fixed again. The table only draws what the page gives it.

interface Person {
  id: number
  name: string
  city: string
  age: number
}

const people = (): Person[] => [
  { id: 1, name: 'Işık Demir', city: 'Iğdır', age: 31 },
  { id: 2, name: 'İpek Yılmaz', city: 'İzmir', age: 28 },
  { id: 3, name: 'ılgaz Kaya', city: 'Ankara', age: 45 },
  { id: 4, name: 'irem Şahin', city: 'İstanbul', age: 22 },
  { id: 5, name: 'Ömer Çelik', city: 'Istanbul', age: 39 },
  { id: 6, name: 'Şule Aydın', city: 'Bursa', age: 33 },
  { id: 7, name: 'Ali Işıklı', city: 'Antalya', age: 27 },
  { id: 8, name: 'Çağla Doğan', city: 'izmir', age: 41 }
]

const dataset = defineDataset<Person>({
  key: 'id',
  fields: {
    id: { type: 'integer' },
    name: { type: 'string', search: true },
    city: { type: 'string', search: true },
    age: { type: 'integer' }
  }
})

const renderLocal = async () => {
  const allRows = shallowRef<Person[]>(people())
  const query = ref<Query>(makeQuery({ pageSize: 2 }))
  const updates: ScenarioUpdate[] = []
  let errorCode: () => string | null = () => null
  const host = defineComponent(() => {
    const local = useLocalQuery({
      allRows,
      dataset,
      query,
      profile: 'tr-1'
    })
    errorCode = () => local.error.value?.code ?? null
    return () =>
      h(
        QueryTable,
        {
          query: query.value,
          columns: [
            { field: 'id', title: 'ID', type: 'integer' },
            { field: 'name', title: 'Name' },
            { field: 'city', title: 'City' },
            { field: 'age', title: 'Age', type: 'integer' }
          ],
          rows: local.rows.value,
          totalRows: local.totalRows.value,
          rowKey: (row: object) => (row as Person).id,
          sortable: true,
          filterable: true,
          filterDebounce: 0,
          searchDebounce: 0,
          pagination: { pageSizeOptions: [2, 5], alwaysShow: true },
          'onUpdate:query': (next: Query, reason: QueryChangeReason) => {
            traceUpdate(next as TableQuery, reason)
            updates.push({
              reason,
              query: JSON.parse(JSON.stringify(next)) as Query
            })
            query.value = next
          }
        },
        {
          toolbar: (bar: ToolbarSlotProps) =>
            h('input', {
              type: 'search',
              'aria-label': 'Search',
              value: bar.search,
              onInput: (event: Event) =>
                bar.setSearch((event.target as HTMLInputElement).value)
            }),
          // An error is not "no results": the page says what went wrong.
          empty: () =>
            local.error.value
              ? h(
                  'p',
                  { role: 'alert', class: 'local-error' },
                  `Cannot show the list: ${local.error.value.code} in ${local.error.value.field}`
                )
              : 'No results.',
          pagination: (pager: PaginationSlotProps) =>
            h(TablePager, { page: pager })
        }
      )
  })
  const screen = await render(host)
  const names = () =>
    [
      ...screen.container.querySelectorAll(
        '.qt-table > tbody > tr[data-row-index] > td[data-field="name"]'
      )
    ].map(cell => cell.textContent)
  const pageInfo = () =>
    screen.container.querySelector('.page-info')?.textContent?.trim()
  return {
    allRows,
    query,
    updates,
    names,
    pageInfo,
    errorCode: () => errorCode()
  }
}

test('C-81 C-80 C-78 C-77 tr-1 search with Turkish capitals, name order, city filter, paging, broken and fixed data', async () => {
  const flow = await renderLocal()
  const expected: ScenarioUpdate[] = []
  expect(flow.names()).toEqual(['Işık Demir', 'İpek Yılmaz'])
  expect(flow.pageInfo()).toBe('Page 1 of 4')

  // 1. `IŞIK` finds `Işık` and `Işıklı`: I, ı, İ and i match each other.
  await userEvent.fill(page.getByRole('searchbox'), 'IŞIK')
  expected.push({
    reason: 'search',
    query: makeQuery({ pageSize: 2, search: 'IŞIK' })
  })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.names).toEqual(['Işık Demir', 'Ali Işıklı'])
  expect(flow.pageInfo()).toBe('Page 1 of 1')

  // The same rows for the dotted capital and for plain ASCII.
  await userEvent.fill(page.getByRole('searchbox'), 'işik')
  expected.push({
    reason: 'search',
    query: makeQuery({ pageSize: 2, search: 'işik' })
  })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.names).toEqual(['Işık Demir', 'Ali Işıklı'])

  // 2. No search: the key goes away, every row is back.
  await userEvent.fill(page.getByRole('searchbox'), '')
  expected.push({ reason: 'search', query: makeQuery({ pageSize: 2 }) })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.names).toEqual(['Işık Demir', 'İpek Yılmaz'])

  // 3. Sort by name in Turkish order: ç after c, ı before i, ö after o.
  await userEvent.click(page.getByCSS('th[data-field="name"] .qt-sort'))
  const sorted = makeQuery({
    pageSize: 2,
    sort: { field: 'name', direction: 'asc' }
  })
  expected.push({ reason: 'sort', query: sorted })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.names).toEqual(['Ali Işıklı', 'Çağla Doğan'])

  // 4. Filter the city by `IR`: Iğdır, İzmir and izmir all match.
  await userEvent.fill(
    page.getByCSS('th[data-field="city"] .qt-filter-input'),
    'IR'
  )
  const filtered = { ...sorted, filters: [rule('city', 'Contains', 'IR')] }
  expected.push({ reason: 'filter', query: filtered })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.names).toEqual(['Çağla Doğan', 'Işık Demir'])
  expect(flow.pageInfo()).toBe('Page 1 of 2')

  // 5. The next page of the filtered, sorted rows.
  await userEvent.click(page.getByRole('button', { name: 'Next', exact: true }))
  const second = { ...filtered, page: 2 }
  expected.push({ reason: 'page', query: second })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.names).toEqual(['İpek Yılmaz'])
  expect(flow.pageInfo()).toBe('Page 2 of 2')

  // 6. A row's name turns into a number: `invalid-data`, even though the
  //    row is filtered out. The page shows the error, not "no results";
  //    the table emits nothing and keeps the page (C-02, C-81).
  flow.allRows.value = people().map(person =>
    person.id === 3 ? ({ ...person, name: 42 } as unknown as Person) : person
  )
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Cannot show the list: invalid-data in name')
  expect(flow.errorCode()).toBe('invalid-data')
  expect(flow.names()).toEqual([])
  expect(document.querySelector('.qt-datatable')).toHaveAttribute('data-empty')
  await expectUpdates(flow.updates, expected)
  expect(flow.query.value).toEqual(second)

  // 7. Fixed data: the same page of the same query again.
  flow.allRows.value = people()
  await expect.poll(flow.names).toEqual(['İpek Yılmaz'])
  expect(flow.errorCode()).toBeNull()
  expect(document.querySelector('[role="alert"]')).toBeNull()
  expect(flow.pageInfo()).toBe('Page 2 of 2')
  await expectUpdates(flow.updates, expected)
})
