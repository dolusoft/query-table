import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { makeQuery, rule } from '../support/fixtures'
import { tabTo } from '../support/keyboard'
import { byAge, createPeople } from '../support/people'
import {
  expectUpdates,
  pageIds,
  renderScenario,
  type ScenarioUpdate
} from '../support/scenario-host'

// The scenario of server-flow.browser.spec.ts without a mouse: Tab, Shift+Tab,
// typing, Enter and Space only. After every step the focus is still where
// the user left it, even though the table drew new rows.

const people = createPeople()

test('C-12 C-07 C-05 C-26 filter, sort, page and open a row with the keyboard only', async () => {
  const flow = await renderScenario({
    initial: makeQuery({ pageSize: 5 }),
    subtable: true,
    // Typed text waits; Enter applies it (C-12).
    props: { filterDebounce: 10_000 }
  })
  const expected: ScenarioUpdate[] = []
  page.getByRole('searchbox').element().focus()

  // 1. Tab to the Name filter, type, Enter.
  const nameFilter = await tabTo('th[data-field="name"] .qt-filter-input')
  await userEvent.keyboard('Alice')
  await expectUpdates(flow.updates, expected)
  await userEvent.keyboard('{Enter}')
  const filtered = makeQuery({
    pageSize: 5,
    filters: [rule('name', 'Contains', 'Alice')]
  })
  expected.push({ reason: 'filter', query: filtered })
  await expectUpdates(flow.updates, expected)
  const alice = people.filter(person => person.name === 'Alice')
  await expect.poll(flow.ids).toEqual(pageIds(alice, 1, 5))
  expect(document.activeElement).toBe(nameFilter)
  expect(flow.pageInfo()).toBe('Page 1 of 3')

  // 2. Tab on to the Age header, Enter sorts; the focus stays on it.
  const ageSort = await tabTo('th[data-field="age"] .qt-sort')
  await userEvent.keyboard('{Enter}')
  const sorted = {
    ...filtered,
    sort: { field: 'age', direction: 'asc' as const }
  }
  expected.push({ reason: 'sort', query: sorted })
  await expectUpdates(flow.updates, expected)
  const aliceByAge = [...alice].sort(byAge)
  await expect.poll(flow.ids).toEqual(pageIds(aliceByAge, 1, 5))
  expect(document.activeElement).toBe(ageSort)
  expect(ageSort.closest('th')).toHaveAttribute('aria-sort', 'ascending')

  // 3. Tab past the body to Next, Enter pages; the focus stays on Next.
  const next = await tabTo('.next-page')
  await userEvent.keyboard('{Enter}')
  const second = { ...sorted, page: 2 }
  expected.push({ reason: 'page', query: second })
  await expectUpdates(flow.updates, expected)
  await expect.poll(flow.ids).toEqual(pageIds(aliceByAge, 2, 5))
  expect(document.activeElement).toBe(next)
  expect(flow.pageInfo()).toBe('Page 2 of 3')

  // 4. Shift+Tab back into the body: the last row's expand button. Enter
  //    opens the row, Space closes it; no query is emitted.
  const expand = await tabTo('.qt-expand', { back: true })
  const id = Number(
    expand.closest('tr')!.querySelector('td[data-field="id"]')!.textContent
  )
  expect(id).toBe(pageIds(aliceByAge, 2, 5)[4])
  await userEvent.keyboard('{Enter}')
  await expect.poll(flow.expandedIds).toEqual([id])
  await expect
    .element(page.getByText(`Detail of ${id}`, { exact: true }))
    .toBeVisible()
  expect(document.activeElement).toBe(expand)
  await userEvent.keyboard(' ')
  await expect.poll(flow.expandedIds).toEqual([])
  expect(document.activeElement).toBe(expand)
  await expectUpdates(flow.updates, expected)

  // 5. Back to the filter, the text replaced and applied with Enter: page 1.
  const again = await tabTo('th[data-field="name"] .qt-filter-input', {
    back: true
  })
  expect(again).toBe(nameFilter)
  await userEvent.keyboard('{Control>}a{/Control}Bob{Enter}')
  expected.push({
    reason: 'filter',
    query: { ...sorted, filters: [rule('name', 'Contains', 'Bob')] }
  })
  await expectUpdates(flow.updates, expected)
  const bobByAge = people.filter(person => person.name === 'Bob').sort(byAge)
  await expect.poll(flow.ids).toEqual(pageIds(bobByAge, 1, 5))
  expect(document.activeElement).toBe(nameFilter)
})
