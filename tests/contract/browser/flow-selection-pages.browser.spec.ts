import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { computed, defineComponent, h, ref } from 'vue'

import QueryTable, {
  type RowSelection,
  type TableQuery
} from '@dolusoft/query-table'

import TablePager from '../../../apps/playground/harness/TablePager.vue'
import { columns, el, makeQuery, rows, sleep } from '../../support/fixtures'

test('F3 C-59 C-64 selection survives page and filter round-trips and select all affects only the current page', async () => {
  const query = ref(makeQuery({ pageSize: 3 }))
  const selection = ref<RowSelection>({})
  const updates: RowSelection[] = []
  const queries: TableQuery[] = []
  const data = rows(6)
  const filtered = computed(() =>
    data.filter(row =>
      query.value.filters.every(
        filter =>
          filter.field === 'name' && row.name.includes(String(filter.value))
      )
    )
  )
  const shown = computed(() =>
    filtered.value.slice((query.value.page - 1) * 3, query.value.page * 3)
  )
  await render(
    defineComponent(
      () => () =>
        h(
          QueryTable as never,
          {
            query: query.value,
            columns: columns(),
            rows: shown.value,
            totalRows: filtered.value.length,
            rowKey: 'id',
            selection: selection.value,
            filterable: true,
            filterDebounce: 0,
            'onUpdate:selection': (next: RowSelection) => {
              updates.push({ ...next })
              selection.value = next
            },
            'onUpdate:query': (next: TableQuery) => {
              queries.push(next)
              query.value = next
            }
          },
          {
            pagination: (
              pager: InstanceType<typeof TablePager>['$props']['page']
            ) => h(TablePager, { page: pager })
          }
        )
    )
  )

  const header = () => el<HTMLInputElement>('.qt-select-all')
  const box = (index: number) =>
    page.getByCSS(`tr[data-row-index="${index}"] .qt-select-row`)
  const selectedIds = () =>
    [...document.querySelectorAll('tr[data-selected] td[data-field="id"]')].map(
      cell => Number(cell.textContent)
    )
  const pick = async (
    target: Parameters<typeof userEvent.click>[0],
    expected: RowSelection
  ) => {
    const count = updates.length
    const queryCount = queries.length
    await userEvent.click(target)
    await expect.poll(() => updates).toHaveLength(count + 1)
    expect(updates[count]).toEqual(expected)
    await sleep(0)
    expect(updates).toHaveLength(count + 1)
    expect(selection.value).toEqual(expected)
    expect(queries).toHaveLength(queryCount)
  }
  await pick(box(0), { 1: true })
  await pick(box(1), { 1: true, 2: true })
  expect(header().checked).toBe(false)
  expect(header().indeterminate).toBe(true)
  await userEvent.click(page.getByRole('button', { name: 'Next', exact: true }))
  await expect.poll(() => shown.value.map(row => row.id)).toEqual([4, 5, 6])
  expect(header().indeterminate).toBe(false)
  await pick(box(0), { 1: true, 2: true, 4: true })
  await pick(header(), { 1: true, 2: true, 4: true, 5: true, 6: true })
  expect(header().checked).toBe(true)
  expect(header().indeterminate).toBe(false)
  await pick(header(), { 1: true, 2: true })
  expect(selectedIds()).toEqual([])
  await pick(box(0), { 1: true, 2: true, 4: true })
  await userEvent.click(
    page.getByRole('button', { name: 'Previous', exact: true })
  )
  await expect.poll(selectedIds).toEqual([1, 2])
  await expect.element(box(0)).toBeChecked()
  await expect.element(box(1)).toBeChecked()
  await expect.element(box(2)).not.toBeChecked()
  expect(selection.value).toEqual({ 1: true, 2: true, 4: true })
  expect(header().indeterminate).toBe(true)

  // Native keyboard activation must use the same controlled selection API.
  el<HTMLInputElement>('tr[data-row-index="1"] .qt-select-row').focus()
  const count = updates.length
  const queryCount = queries.length
  await userEvent.keyboard(' ')
  await expect.poll(() => updates).toHaveLength(count + 1)
  await sleep(0)
  expect(updates).toHaveLength(count + 1)
  expect(selection.value).toEqual({ 1: true, 4: true })
  expect(updates[count]).toEqual({ 1: true, 4: true })
  expect(queries).toHaveLength(queryCount)
  await userEvent.fill(
    page.getByCSS('th[data-field="name"] .qt-filter-input'),
    'Name 4'
  )
  await expect.poll(selectedIds).toEqual([4])
  expect(selection.value).toEqual({ 1: true, 4: true })
  await userEvent.fill(
    page.getByCSS('th[data-field="name"] .qt-filter-input'),
    ''
  )
  await expect.poll(selectedIds).toEqual([1])
  await expect.element(box(0)).toBeChecked()
  expect(selection.value).toEqual({ 1: true, 4: true })
})
