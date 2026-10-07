import { expect, test } from 'vitest'
import { commands, page } from 'vitest/browser'

import { makeQuery, rule } from '../support/fixtures'
import { createPeople } from '../support/people'
import {
  expectUpdates,
  pageIds,
  renderScenario,
  type ScenarioUpdate
} from '../support/scenario-host'

// The scenario of server-flow.browser.spec.ts on a phone (the touch instance
// of the browser project: 390x844, a touch screen): every action is a tap,
// text comes from the on-screen keyboard. The page never scrolls sideways.

const people = createPeople()
const byAge = (a: { age: number; id: number }, b: typeof a) =>
  a.age - b.age || a.id - b.id
const tap = (css: string) => commands.tap(page.getByCSS(css).selector)
const tapRow = (
  id: number,
  css: string,
  flow: { rowOf: (id: number) => HTMLElement }
) => {
  const index = flow.rowOf(id).dataset.rowIndex
  return tap(`.qt-table > tbody > tr[data-row-index="${index}"] ${css}`)
}
const expectNoPageOverflow = () => {
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
}

test('C-09 C-07 C-05 C-59 C-26 C-22 tap to filter, sort, page, select, expand and clear on a phone', async () => {
  expect(window.innerWidth).toBe(390)
  const flow = await renderScenario({ selection: true, subtable: true })
  const expected: ScenarioUpdate[] = []
  expectNoPageOverflow()

  // 1. Tap the Name filter and type.
  await tap('th[data-field="name"] .qt-filter-input')
  expect(document.activeElement).toBe(flow.filter('name').element())
  await flow.filter('name').fill('Alice')
  const filtered = makeQuery({ filters: [rule('name', 'Contains', 'Alice')] })
  expected.push({ reason: 'filter', query: filtered })
  await expectUpdates(flow.updates, expected)
  const alice = people.filter(person => person.name === 'Alice')
  await expect.poll(flow.ids).toEqual(pageIds(alice, 1, 10))
  expectNoPageOverflow()

  // 2. Tap the Age header.
  await tap('th[data-field="age"] .qt-sort')
  const sorted = {
    ...filtered,
    sort: { field: 'age', direction: 'asc' as const }
  }
  expected.push({ reason: 'sort', query: sorted })
  await expectUpdates(flow.updates, expected)
  const aliceByAge = [...alice].sort(byAge)
  await expect.poll(flow.ids).toEqual(pageIds(aliceByAge, 1, 10))
  expectNoPageOverflow()

  // 3. Tap Next.
  await tap('.next-page')
  const second = { ...sorted, page: 2 }
  expected.push({ reason: 'page', query: second })
  await expectUpdates(flow.updates, expected)
  const lastPage = pageIds(aliceByAge, 2, 10)
  await expect.poll(flow.ids).toEqual(lastPage)
  expect(flow.pageInfo()).toBe('Page 2 of 2')

  // 4. Tap a row's checkbox, 5. tap its expand button: no query.
  const picked = lastPage[1]
  await tapRow(picked, '.qt-select-row', flow)
  await expect.poll(flow.selection).toEqual({ [picked]: true })
  expect(flow.selectedIds()).toEqual([picked])
  await tapRow(picked, '.qt-expand', flow)
  await expect.poll(flow.expandedIds).toEqual([picked])
  await expect
    .element(page.getByText(`Detail of ${picked}`, { exact: true }))
    .toBeVisible()
  await expectUpdates(flow.updates, expected)
  expectNoPageOverflow()

  // 6. Tap clear-all: reset to page 1, sort kept; the selection stays the
  //    page's, the opened row has left `rows` and is closed.
  await tap('.qt-clear-all-button')
  expected.push({ reason: 'reset', query: { ...sorted, filters: [] } })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.ids).toEqual(pageIds([...people].sort(byAge), 1, 10))
  expect(flow.selection()).toEqual({ [picked]: true })
  expect(flow.expandedIds()).toEqual([])
  await expect.element(flow.filter('name')).toHaveValue('')
  expectNoPageOverflow()
})
