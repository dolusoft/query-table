import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { makeQuery, rule } from '../support/fixtures'
import { tabTo } from '../support/keyboard'
import { createPeople } from '../support/people'
import {
  expectUpdates,
  pageIds,
  renderScenario,
  type ScenarioUpdate
} from '../support/scenario-host'

// A slow server: every request leaves the table loading until the test
// answers it. The answers go through every state the table can be in:
// loading over rows, empty, a server error (the page's message in the
// `empty` slot), rows again. The focus stays where the user put it.

const people = createPeople()

const expectState = (
  root: HTMLElement,
  state: 'loading' | 'empty' | 'rows'
) => {
  expect(root.hasAttribute('data-loading')).toBe(state === 'loading')
  expect(root.getAttribute('aria-busy')).toBe(
    state === 'loading' ? 'true' : null
  )
  expect(root.hasAttribute('data-empty')).toBe(state === 'empty')
  expect(root.querySelector('.qt-loading-row') !== null).toBe(
    state === 'loading'
  )
  expect(root.querySelector('.qt-empty-row') !== null).toBe(state === 'empty')
}

test('C-52 C-38 C-24 loading, empty, error and rows again keep the focus where the user left it', async () => {
  const flow = await renderScenario({ deferred: true, subtable: true })
  const expected: ScenarioUpdate[] = []
  const root = flow.root()
  expectState(root, 'rows')
  expect(flow.ids()).toEqual(pageIds(people, 1, 10))

  // Loading over rows: the old rows stay drawn, the focus stays in the
  // filter input the user types in.
  const input = flow.filter('name').element() as HTMLInputElement
  await userEvent.click(input)
  await userEvent.fill(input, 'nobody')
  const nobody = makeQuery({ filters: [rule('name', 'Contains', 'nobody')] })
  expected.push({ reason: 'filter', query: nobody })
  await expectUpdates(flow.updates, expected)
  await expect.poll(() => root.hasAttribute('data-loading')).toBe(true)
  expectState(root, 'loading')
  expect(flow.ids()).toEqual(pageIds(people, 1, 10))
  expect(document.activeElement).toBe(input)

  // Empty: the `empty` slot, no loading row. The server still reports the
  // old total; the empty state comes from the rows, not the total (C-24).
  await flow.respond({ kind: 'empty', totalRows: 200 })
  expect(document.querySelector('.scenario-total')?.textContent).toBe('200')
  await expect.poll(() => root.hasAttribute('data-empty')).toBe(true)
  expectState(root, 'empty')
  await expect
    .element(page.getByText('No results.', { exact: true }))
    .toBeVisible()
  expect(flow.ids()).toEqual([])
  expect(document.activeElement).toBe(input)

  // Loading without rows: no empty state while fetching (C-38).
  await userEvent.fill(input, 'Alice')
  const alice = makeQuery({ filters: [rule('name', 'Contains', 'Alice')] })
  expected.push({ reason: 'filter', query: alice })
  await expectUpdates(flow.updates, expected)
  await expect.poll(() => root.hasAttribute('data-loading')).toBe(true)
  expectState(root, 'loading')
  expect(document.activeElement).toBe(input)

  // A server error: the page's message in the `empty` slot.
  await flow.respond({ kind: 'error', message: 'The server is unavailable.' })
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('The server is unavailable.')
  expectState(root, 'empty')
  expect(document.activeElement).toBe(input)

  // The user goes to the page's Reload button with the keyboard. Reloading
  // is the page's request: the table emits nothing.
  const reload = await tabTo('.scenario-retry', { back: true })
  await userEvent.keyboard('{Enter}')
  await expect.poll(() => root.hasAttribute('data-loading')).toBe(true)
  expectState(root, 'loading')
  expect(document.activeElement).toBe(reload)
  await flow.respond()
  const aliceIds = people
    .filter(person => person.name === 'Alice')
    .map(person => person.id)
  await expect.poll(flow.ids).toEqual(aliceIds.slice(0, 10))
  expectState(root, 'rows')
  expect(document.querySelector('[role="alert"]')).toBeNull()
  expect(document.activeElement).toBe(reload)
  await expectUpdates(flow.updates, expected)

  // A reload while the user is on a row: the rows stay drawn while loading
  // and the same rows (same keys) come back, so the focused button is the
  // same element afterwards, and the opened row is still open.
  const expand = flow.inRow(aliceIds[1], '.qt-expand').element() as HTMLElement
  await userEvent.click(expand)
  await expect.poll(flow.expandedIds).toEqual([aliceIds[1]])
  expect(document.activeElement).toBe(expand)
  flow.reload()
  await expect.poll(() => root.hasAttribute('data-loading')).toBe(true)
  expect(document.activeElement).toBe(expand)
  expect(expand.isConnected).toBe(true)
  // This answer reports a total of 0 with rows: the rows are drawn whatever
  // the total says (C-24).
  await flow.respond({ kind: 'rows', totalRows: 0 })
  await expect.poll(() => root.hasAttribute('data-loading')).toBe(false)
  expect(document.querySelector('.scenario-total')?.textContent).toBe('0')
  expect(flow.ids()).toEqual(aliceIds.slice(0, 10))
  expectState(root, 'rows')
  expect(document.activeElement).toBe(expand)
  expect(expand.isConnected).toBe(true)
  expect(flow.expandedIds()).toEqual([aliceIds[1]])
  await expectUpdates(flow.updates, expected)
  expect(flow.requests).toEqual([makeQuery(), nobody, alice, alice, alice])
})
