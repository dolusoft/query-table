import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { createPeople } from '../support/people'
import {
  expectUpdates,
  renderScenario,
  type ScenarioUpdate
} from '../support/scenario-host'
import { cursorQuery } from '../support/server-flow'

// A user searches a cursor-paged list (no total), walks forward and back,
// selects rows on two pages, searches again and clears the search. The
// selection is the page's map of keys: it outlives pages and searches, and
// never emits a query.

const people = createPeople()
const ofCity = (city: string) =>
  people.filter(person => person.city === city).map(person => person.id)

test('C-58 C-56 C-57 C-59 C-64 C-65 search, walk cursors, select on two pages, search again and clear', async () => {
  const flow = await renderScenario({
    initial: cursorQuery(),
    selection: true
  })
  const expected: ScenarioUpdate[] = []
  const previous = page.getByRole('button', { name: 'Previous', exact: true })
  const next = page.getByRole('button', { name: 'Next', exact: true })
  const selectAll = () =>
    document.querySelector<HTMLInputElement>('.qt-select-all')!
  expect(flow.pageInfo()).toBe('Cursor paging')
  await expect.element(previous).toBeDisabled()
  expect(flow.ids()).toEqual(people.slice(0, 10).map(person => person.id))

  // 1. Search: the first page of the matches (`cursor: null`).
  await userEvent.fill(page.getByRole('searchbox'), 'bursa')
  const searched = cursorQuery({ search: 'bursa' })
  expected.push({ reason: 'search', query: searched })
  await expectUpdates(flow.updates, expected)
  const bursa = ofCity('Bursa')
  expect(bursa).toHaveLength(40)
  await expect.poll(flow.ids).toEqual(bursa.slice(0, 10))
  await expect.element(previous).toBeDisabled()
  await expect.element(next).toBeEnabled()
  expect(document.querySelector('.scenario-total')?.textContent).toBe('null')

  // 2. Forward with the server's next cursor.
  await userEvent.click(next)
  const forward = {
    ...searched,
    cursor: { token: btoa('10'), direction: 'next' as const }
  }
  expected.push({ reason: 'page', query: forward })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.ids).toEqual(bursa.slice(10, 20))
  await expect.element(previous).toBeEnabled()

  // 3. Two rows of the second page: selection only, no query.
  const [a, b] = bursa.slice(10, 12)
  await userEvent.click(flow.inRow(a, '.qt-select-row'))
  await expect.poll(flow.selection).toEqual({ [a]: true })
  await userEvent.click(flow.inRow(b, '.qt-select-row'))
  await expect.poll(flow.selection).toEqual({ [a]: true, [b]: true })
  expect(flow.selectedIds()).toEqual([a, b])
  expect(selectAll().indeterminate).toBe(true)
  await expectUpdates(flow.updates, expected)

  // 4. Back: the first page has none of them selected, the map keeps both.
  await userEvent.click(previous)
  const backward = {
    ...searched,
    cursor: { token: btoa('0'), direction: 'prev' as const }
  }
  expected.push({ reason: 'page', query: backward })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.ids).toEqual(bursa.slice(0, 10))
  expect(flow.selectedIds()).toEqual([])
  expect(selectAll().checked).toBe(false)
  expect(selectAll().indeterminate).toBe(false)

  // 5. Select the whole first page: the keys of the other page stay (C-64).
  await userEvent.click(page.getByCSS('.qt-select-all'))
  const firstPage = Object.fromEntries(bursa.slice(0, 10).map(id => [id, true]))
  await expect
    .poll(flow.selection)
    .toEqual({ ...firstPage, [a]: true, [b]: true })
  expect(flow.selectedIds()).toEqual(bursa.slice(0, 10))
  expect(selectAll().checked).toBe(true)
  await expectUpdates(flow.updates, expected)
  const selected = flow.selection()

  // 6. Another search starts over at `cursor: null` (C-57); the selection
  //    is not touched, and none of the new rows is in it.
  await userEvent.fill(page.getByRole('searchbox'), 'ankara')
  const ankara = cursorQuery({ search: 'ankara' })
  expected.push({ reason: 'search', query: ankara })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.ids).toEqual(ofCity('Ankara').slice(0, 10))
  expect(flow.selection()).toEqual(selected)
  expect(flow.selectedIds()).toEqual([])
  await expect.element(previous).toBeDisabled()

  // 7. Clearing the search removes the key (C-58) and shows the first page
  //    of everyone, where the selected Bursa rows are checked again.
  await userEvent.fill(page.getByRole('searchbox'), '')
  expected.push({ reason: 'search', query: cursorQuery() })
  await expectUpdates(flow.updates, expected)
  expect(flow.updates[flow.updates.length - 1].query).not.toHaveProperty(
    'search'
  )
  const everyone = people.slice(0, 10).map(person => person.id)
  await expect.poll(flow.ids).toEqual(everyone)
  expect(flow.selectedIds()).toEqual(everyone.filter(id => selected[id]))
  expect(flow.selections).toHaveLength(3)
  expect(flow.requests).toEqual([
    cursorQuery(),
    ...expected.map(update => update.query)
  ])
})
