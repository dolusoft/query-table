import { defineDataset } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from '@dolusoft/query-table/local'
import { describe, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref } from 'vue'

import {
  QueryTable,
  type TableQuery,
  type Query,
  type PaginationSlotProps,
  type QueryChangeReason
} from '@dolusoft/query-table'

import { traceUpdate } from '../../support/trace'

describe('C-81 useLocalQuery [own]', () => {
  test('sort, page and folded city filters render the locally evaluated query', async () => {
    const allRows = [
      { id: 1, name: 'Şule', city: 'Ankara' },
      { id: 2, name: 'ali', city: 'Istanbul' },
      { id: 3, name: 'Ali', city: 'İstanbul' },
      { id: 4, name: 'Çağla', city: 'Bursa' }
    ]
    const dataset = defineDataset<(typeof allRows)[number]>({
      key: 'id',
      fields: {
        id: { type: 'integer' },
        name: { type: 'string', search: true },
        city: { type: 'string', search: true }
      }
    })
    const query = ref<Query>({
      page: 1,
      pageSize: 2,
      sort: null,
      filters: []
    })
    const updates: Array<{ query: Query; reason: QueryChangeReason }> = []
    const host = defineComponent(() => {
      const local = useLocalQuery({ allRows, dataset, query, profile: 'tr-1' })
      return () =>
        h(
          QueryTable,
          {
            query: query.value,
            columns: [
              { field: 'name', title: 'Name' },
              { field: 'city', title: 'City' }
            ],
            rows: local.rows.value,
            totalRows: local.totalRows.value,
            rowKey: (row: object) => (row as { id: number }).id,
            sortable: true,
            filterable: true,
            filterDebounce: 0,
            'onUpdate:query': (next: Query, reason: QueryChangeReason) => {
              traceUpdate(next as TableQuery, reason)
              updates.push({ query: next, reason })
              query.value = next
            }
          },
          {
            pagination: (p: PaginationSlotProps) =>
              h('button', { disabled: !p.canNext, onClick: p.nextPage }, 'Next')
          }
        )
    })
    const screen = await render(host)
    const cells = (field: string) =>
      [
        ...screen.container.querySelectorAll(`tbody td[data-field="${field}"]`)
      ].map(cell => cell.textContent)
    expect(updates).toEqual([])
    expect(cells('name')).toEqual(['Şule', 'ali'])
    await userEvent.click(page.getByCSS('th[data-field="name"] .qt-sort'))
    await expect.poll(() => cells('name')).toEqual(['Ali', 'ali'])
    expect(updates).toEqual([
      {
        query: {
          page: 1,
          pageSize: 2,
          filters: [],
          sort: { field: 'name', direction: 'asc' }
        },
        reason: 'sort'
      }
    ])
    await userEvent.click(
      page.getByRole('button', { name: 'Next', exact: true })
    )
    await expect.poll(() => cells('name')).toEqual(['Çağla', 'Şule'])
    expect(updates).toHaveLength(2)
    expect(updates[1]).toEqual({
      query: { ...updates[0].query, page: 2 },
      reason: 'page'
    })
    await userEvent.fill(
      page.getByCSS('th[data-field="city"] .qt-filter-input'),
      'ist'
    )
    await expect.poll(() => cells('city')).toEqual(['İstanbul', 'Istanbul'])
    expect(updates).toHaveLength(3)
    expect(updates[2]).toEqual({
      query: {
        ...updates[0].query,
        filters: [{ field: 'city', condition: 'Contains', value: 'ist' }]
      },
      reason: 'filter'
    })
    expect(cells('name')).toEqual(['Ali', 'ali'])
  })

  test('tr-1 text order differs from the ordinal order of the same names', async () => {
    const allRows = ['Zeynep', 'İpek', 'Işık', 'Ayşe', 'Çağla'].map(
      (name, id) => ({ id, name })
    )
    const dataset = defineDataset<(typeof allRows)[number]>({
      key: 'id',
      fields: { id: { type: 'integer' }, name: { type: 'string' } }
    })
    const query = ref<Query>({
      page: 1,
      pageSize: 10,
      sort: { field: 'name', direction: 'asc' },
      filters: []
    })
    let names: () => string[] = () => []
    await render(
      defineComponent(() => {
        const local = useLocalQuery({
          allRows,
          dataset,
          query,
          profile: 'tr-1'
        })
        names = () => local.rows.value.map(row => row.name)
        return () => h('div')
      })
    )
    // `ı` sorts before `i`, `ç` after `c`: Turkish letters sit between the
    // ASCII ones. A code unit order would put `Ç` and `İ` after `Z`.
    expect(names()).toEqual(['Ayşe', 'Çağla', 'Işık', 'İpek', 'Zeynep'])
    expect(names()).not.toEqual(allRows.map(row => row.name).sort())
    query.value = { ...query.value, sort: { field: 'name', direction: 'desc' } }
    await expect
      .poll(names)
      .toEqual(['Zeynep', 'İpek', 'Işık', 'Çağla', 'Ayşe'])
  })
})
