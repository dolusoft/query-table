import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { makeQuery, rule } from '../support/fixtures'
import { byAge, createPeople } from '../support/people'
import {
  expectUpdates,
  pageIds,
  renderScenario,
  type ScenarioUpdate
} from '../support/scenario-host'

// A user works through a server-backed list from start to end: filter,
// sort, page, select a row, open it, then clear the filter. After every step
// the scenario checks what the table draws and the whole sequence of
// `update:query` events (reason and query) it has emitted so far.

const people = createPeople()

test('C-09 C-12 C-07 C-05 C-59 C-26 C-22 type a filter, sort, next page, select, expand and clear the filter', async () => {
  // A real filter debounce: typing waits for the user to stop (C-09).
  const flow = await renderScenario({
    selection: true,
    subtable: true,
    props: { filterDebounce: 300 }
  })
  const expected: ScenarioUpdate[] = []
  expect(flow.ids()).toEqual(pageIds(people, 1, 10))
  expect(flow.pageInfo()).toBe('Page 1 of 20')
  expect(flow.updates).toEqual([])

  // 1. Type a name key by key: nothing while typing, then one update for
  //    the whole text, page 1 of the matching rows.
  await userEvent.click(flow.filter('name'))
  await userEvent.keyboard('Alice')
  await expect.element(flow.filter('name')).toHaveValue('Alice')
  expect(flow.updates).toEqual([])
  const filtered = makeQuery({ filters: [rule('name', 'Contains', 'Alice')] })
  expected.push({ reason: 'filter', query: filtered })
  await expectUpdates(flow.updates, expected)
  const alice = people.filter(person => person.name === 'Alice')
  expect(alice).toHaveLength(14)
  await expect.poll(flow.ids).toEqual(pageIds(alice, 1, 10))
  expect(flow.pageInfo()).toBe('Page 1 of 2')
  await expect
    .element(page.getByCSS('th[data-field="name"]'))
    .toHaveAttribute('data-filtered')

  // 2. Sort by age: the page is kept (C-07), the filter stays.
  await userEvent.click(flow.sortButton('age'))
  const sorted = {
    ...filtered,
    sort: { field: 'age', direction: 'asc' as const }
  }
  expected.push({ reason: 'sort', query: sorted })
  await expectUpdates(flow.updates, expected)
  const aliceByAge = [...alice].sort(byAge)
  await expect.poll(flow.ids).toEqual(pageIds(aliceByAge, 1, 10))
  await expect
    .element(page.getByCSS('th[data-field="age"]'))
    .toHaveAttribute('aria-sort', 'ascending')

  // 3. Next page: only `page` changes.
  await userEvent.click(page.getByRole('button', { name: 'Next', exact: true }))
  const second = { ...sorted, page: 2 }
  expected.push({ reason: 'page', query: second })
  await expectUpdates(flow.updates, expected)
  const lastPage = pageIds(aliceByAge, 2, 10)
  expect(lastPage).toHaveLength(4)
  await expect.poll(flow.ids).toEqual(lastPage)
  expect(flow.pageInfo()).toBe('Page 2 of 2')
  await expect
    .element(page.getByRole('button', { name: 'Next', exact: true }))
    .toBeDisabled()

  // 4. Select a row: the selection is the page's, no query is emitted.
  const picked = lastPage[1]
  await userEvent.click(flow.inRow(picked, '.qt-select-row'))
  await expect.poll(() => flow.selections).toEqual([{ [picked]: true }])
  expect(flow.selectedIds()).toEqual([picked])
  await expectUpdates(flow.updates, expected)

  // 5. Open it: the subtable follows the row, no query is emitted.
  await userEvent.click(flow.inRow(picked, '.qt-expand'))
  await expect.poll(flow.expandedIds).toEqual([picked])
  await expect
    .element(page.getByText(`Detail of ${picked}`, { exact: true }))
    .toBeVisible()
  await expect
    .element(flow.inRow(picked, '.qt-expand'))
    .toHaveAttribute('aria-expanded', 'true')
  await expectUpdates(flow.updates, expected)

  // 6. Clear the filters: reason `reset`, page 1, sort kept (C-22). The
  //    selection is kept as the page holds it (C-59); the opened row left
  //    `rows`, so it is closed when it comes back (C-26).
  await userEvent.click(page.getByCSS('.qt-clear-all-button'))
  const cleared = { ...sorted, filters: [] }
  expected.push({ reason: 'reset', query: cleared })
  await expectUpdates(flow.updates, expected)
  const everyoneByAge = [...people].sort(byAge)
  await expect.poll(flow.ids).toEqual(pageIds(everyoneByAge, 1, 10))
  await expect.element(flow.filter('name')).toHaveValue('')
  await expect.element(page.getByCSS('.qt-clear-all-button')).toBeDisabled()
  expect(flow.selection()).toEqual({ [picked]: true })
  expect(flow.selections).toHaveLength(1)
  expect(flow.expandedIds()).toEqual([])
  expect(document.querySelector('.scenario-detail')).toBeNull()

  // Back to the picked row with the filter typed again: still selected,
  // closed. Enter applies the text without waiting (C-12).
  await userEvent.fill(flow.filter('name'), 'Alice')
  await userEvent.keyboard('{Enter}')
  expected.push({ reason: 'filter', query: { ...sorted, page: 1 } })
  await expectUpdates(flow.updates, expected)
  await userEvent.click(page.getByRole('button', { name: 'Next', exact: true }))
  expected.push({ reason: 'page', query: second })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.ids).toEqual(lastPage)
  expect(flow.selectedIds()).toEqual([picked])
  expect(flow.expandedIds()).toEqual([])
  expect(flow.requests).toEqual([
    makeQuery(),
    ...expected.map(update => update.query)
  ])
})
