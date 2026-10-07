import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { makeQuery, rule } from '../../support/fixtures'
import { renderServerFlow } from '../../support/server-flow'

test('F1 C-04 C-05 C-06 C-07 C-10 filter, sort, page and size send one exact server query per action', async () => {
  const age = rule('age', 'GreaterThanOrEqual', 22)
  const initial = makeQuery({ page: 3, filters: [age] })
  const flow = await renderServerFlow(initial)
  expect(flow.updates).toEqual([])
  expect(flow.requests).toEqual([initial])

  await userEvent.fill(flow.filter('name'), 'a')
  const filtered = makeQuery({ filters: [age, rule('name', 'Contains', 'a')] })
  await expect
    .poll(() => flow.updates)
    .toEqual([{ reason: 'filter', query: filtered }])
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(1)
  await expect.element(page.getByCSS('.server-total')).toHaveTextContent('120')
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 1 of 12')
  expect(flow.ids()).toEqual([1, 2, 4, 6, 7, 9, 11, 12, 13, 16])

  await userEvent.click(page.getByCSS('th[data-field="age"] .qt-sort'))
  const sorted = {
    ...filtered,
    sort: { field: 'age', direction: 'asc' as const }
  }
  await expect.poll(() => flow.updates.length).toBe(2)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(2)
  expect(flow.updates[1]).toEqual({ reason: 'sort', query: sorted })
  expect(flow.ids()).toEqual([1, 31, 61, 91, 121, 151, 181, 27, 57, 87])

  await userEvent.click(page.getByRole('button', { name: 'Next', exact: true }))
  const paged = { ...sorted, page: 2 }
  await expect.poll(() => flow.updates.length).toBe(3)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(3)
  expect(flow.updates[2]).toEqual({ reason: 'page', query: paged })
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 2 of 12')
  expect(flow.ids()).toEqual([117, 147, 177, 6, 36, 66, 96, 126, 156, 186])

  await userEvent.selectOptions(
    page.getByRole('combobox', { name: 'Rows per page' }),
    '50'
  )
  const resized = { ...sorted, pageSize: 50 }
  await expect.poll(() => flow.updates.length).toBe(4)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(4)
  expect(flow.updates[3]).toEqual({ reason: 'pageSize', query: resized })
  expect(flow.ids()).toHaveLength(50)
  expect(flow.ids().slice(0, 10)).toEqual([
    1, 31, 61, 91, 121, 151, 181, 27, 57, 87
  ])
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 1 of 3')
  expect(flow.requests).toEqual([initial, filtered, sorted, paged, resized])
})

test('F11 C-02 C-18 external query restoration updates filters, condition, sort and page without emitting', async () => {
  const flow = await renderServerFlow()
  await userEvent.fill(flow.filter('name'), 'Alice')
  await expect.poll(() => flow.updates.length).toBe(1)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(1)
  const restored = makeQuery({
    page: 2,
    pageSize: 5,
    sort: { field: 'age', direction: 'desc' },
    filters: [rule('name', 'StartsWith', 'a')]
  })
  await flow.restore(restored)
  await expect.element(flow.filter('name')).toHaveValue('a*')
  await expect
    .element(page.getByCSS('th[data-field="name"] .qt-filter-condition'))
    .toHaveTextContent('Starts With')
  await expect
    .element(page.getByCSS('th[data-field="age"]'))
    .toHaveAttribute('aria-sort', 'descending')
  await expect
    .element(page.getByCSS('th[data-field="age"]'))
    .toHaveAttribute('data-sort', 'desc')
  await expect
    .element(page.getByRole('combobox', { name: 'Rows per page' }))
    .toHaveValue('5')
  await expect
    .element(page.getByCSS('.page-info'))
    .toHaveTextContent('Page 2 of 3')
  expect(flow.ids()).toHaveLength(5)
  expect(flow.updates).toEqual([
    {
      reason: 'filter',
      query: makeQuery({ filters: [rule('name', 'Contains', 'Alice')] })
    }
  ])
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(1)
  expect(flow.requests).toHaveLength(3)
  expect(flow.requests[2]).toEqual(restored)
})

test('F9 C-22 C-38 C-52 delayed responses keep rows and the pending query while busy and recover from empty', async () => {
  const flow = await renderServerFlow(makeQuery(), { deferred: true })
  await flow.respond(0)
  const originalIds = flow.ids()
  await userEvent.fill(flow.filter('name'), 'Alice')
  await expect
    .element(page.getByCSS('.qt-datatable'))
    .toHaveAttribute('aria-busy', 'true')
  expect(flow.ids()).toEqual(originalIds)
  await expect.poll(() => flow.updates.length).toBe(1)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(1)
  await userEvent.fill(flow.filter('name'), 'Bob')
  await expect.poll(() => flow.updates.length).toBe(2)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(2)
  expect(flow.requests.slice(1)).toEqual([
    makeQuery({ filters: [rule('name', 'Contains', 'Alice')] }),
    makeQuery({ filters: [rule('name', 'Contains', 'Bob')] })
  ])
  const pending = makeQuery({ filters: [rule('name', 'Contains', 'Bob')] })
  expect(flow.updates[1]).toEqual({ reason: 'filter', query: pending })
  await expect.element(flow.filter('name')).toHaveValue('Bob')
  await expect
    .element(page.getByCSS('.qt-datatable'))
    .toHaveAttribute('data-loading')
  await expect
    .element(page.getByCSS('.qt-loading-row'))
    .toHaveTextContent('Loading…')
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.ids()).toEqual(originalIds)
  expect(flow.updates).toHaveLength(2)
  expect(flow.updates[1].query).toEqual(pending)
  expect(flow.requests[2]).toEqual(pending)
  await flow.respond(2)
  expect(flow.ids()).toEqual([3, 18, 33, 48, 63, 78, 93, 108, 123, 138])
  await expect
    .element(page.getByCSS('.qt-datatable'))
    .not.toHaveAttribute('aria-busy')

  await userEvent.fill(flow.filter('name'), 'no-such-person')
  await expect.poll(() => flow.updates.length).toBe(3)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(3)
  await flow.respond(3)
  await expect
    .element(page.getByText('No results.', { exact: true }))
    .toBeVisible()
  expect(flow.ids()).toEqual([])
  await userEvent.click(page.getByCSS('.qt-clear-all-button'))
  await expect
    .element(page.getByCSS('.qt-datatable'))
    .toHaveAttribute('aria-busy', 'true')
  await expect
    .element(page.getByText('No results.', { exact: true }))
    .not.toBeInTheDocument()
  await expect.poll(() => flow.updates.length).toBe(4)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(4)
  await flow.respond(4)
  expect(flow.ids()).toEqual(originalIds)
  await expect
    .element(page.getByCSS('.qt-datatable'))
    .not.toHaveAttribute('aria-busy')
  expect(flow.updates.map(update => update.reason)).toEqual([
    'filter',
    'filter',
    'filter',
    'reset'
  ])
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(4)
  expect(flow.updates[3].query).toEqual(makeQuery())
  expect(flow.requests).toHaveLength(5)
})
