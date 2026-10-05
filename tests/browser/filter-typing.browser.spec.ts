import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'

import { renderTable, rows, shot, sleep } from './helpers'

// Real keystrokes, real timers, real focus. happy-dom's `setValue` writes the
// whole value in one input event and has no focus model worth testing.

test('typing a word key by key emits once, after the debounce from the last key', async () => {
  const { filterInput, filterOf, changes, t0 } = await renderTable({
    filterDebounce: 150
  })
  const input = filterInput('name')
  // Take the time of the last key from the input event itself: the moment
  // `keyboard()` resolves is later by the driver round trip, which made the
  // measured gap fall below the debounce on slower machines.
  let lastKeyAt = 0
  input.element().addEventListener('input', () => (lastKeyAt = performance.now() - t0))
  await userEvent.click(input)
  await userEvent.keyboard('ali')
  await sleep(100)
  // Still inside the debounce window: nothing yet.
  expect(changes).toHaveLength(0)
  await expect.poll(() => changes.length).toBe(1)
  await sleep(300)
  expect(changes).toHaveLength(1)
  expect(changes[0].at - lastKeyAt).toBeGreaterThanOrEqual(140)
  expect(changes[0].payload).toMatchObject({
    change_type: 'filter',
    current_page: 1
  })
  expect(filterOf(changes[0], 'name')).toMatchObject({
    value: 'ali',
    condition: 'Contains'
  })
})

test('Enter flushes the pending debounce immediately', async () => {
  const { filterInput, filterOf, changes, t0 } = await renderTable({
    filterDebounce: 2000
  })
  await userEvent.click(filterInput('name'))
  await userEvent.keyboard('bob')
  const beforeEnter = performance.now() - t0
  await userEvent.keyboard('{Enter}')
  await expect.poll(() => changes.length).toBe(1)
  expect(changes[0].at - beforeEnter).toBeLessThan(1000)
  expect(filterOf(changes[0], 'name').value).toBe('bob')
  // The flushed timer must not fire a second time.
  await sleep(2200)
  expect(changes).toHaveLength(1)
})

test('focus and caret stay in the filter input while the server answers with new rows', async () => {
  const { screen, filterInput, changes } = await renderTable()
  const input = filterInput('name')
  const el = input.element() as HTMLInputElement
  await userEvent.click(input)
  await userEvent.keyboard('Na')
  await expect.poll(() => changes.length).toBe(1)
  // What a consumer does in its change handler: replace the rows.
  await screen.rerender({ rows: rows(2), totalRows: 2 })
  expect(document.activeElement).toBe(el)
  await userEvent.keyboard('me')
  expect(el.value).toBe('Name')
  expect(el.selectionStart).toBe(4)
  await expect.poll(() => changes.length).toBe(2)
  await shot('filter-focus-after-rerender')
})

test('Tab moves focus from one header filter input to the next', async () => {
  const { filterInput } = await renderTable()
  await userEvent.click(filterInput('id'))
  // id input -> id filter button -> name input
  await userEvent.tab()
  await userEvent.tab()
  expect(document.activeElement).toBe(filterInput('name').element())
})
