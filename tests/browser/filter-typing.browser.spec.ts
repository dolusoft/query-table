import { describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'

import { renderTable, rows, rule, shot, sleep } from './helpers'

// Real keystrokes, real timers, real focus. happy-dom's `setValue` writes the
// whole value in one input event and has no focus model worth testing.

describe('C-09 typing in a header filter', () => {
  test('typing a word key by key applies once, after the debounce from the last key', async () => {
    const { filterInput, updates, t0 } = await renderTable({
      filterDebounce: 150
    })
    const input = filterInput('name')
    // Take the time of the last key from the input event itself: the moment
    // `keyboard()` resolves is later by the driver round trip, which made the
    // measured gap fall below the debounce on slower machines.
    let lastKeyAt = 0
    input
      .element()
      .addEventListener('input', () => (lastKeyAt = performance.now() - t0))
    await userEvent.click(input)
    await userEvent.keyboard('ali')
    await sleep(100)
    // Still inside the debounce window: nothing yet.
    expect(updates).toHaveLength(0)
    await expect.poll(() => updates.length).toBe(1)
    await sleep(300)
    expect(updates).toHaveLength(1)
    expect(updates[0].at - lastKeyAt).toBeGreaterThanOrEqual(140)
    expect(updates[0].reason).toBe('filter')
    expect(updates[0].query.page).toBe(1)
    expect(updates[0].query.filters).toEqual([rule('name', 'Contains', 'ali')])
  })
})

describe('C-12 Enter in a header filter', () => {
  test('flushes the pending debounce immediately', async () => {
    const { filterInput, updates, t0 } = await renderTable({
      filterDebounce: 2000
    })
    await userEvent.click(filterInput('name'))
    await userEvent.keyboard('bob')
    const beforeEnter = performance.now() - t0
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => updates.length).toBe(1)
    expect(updates[0].at - beforeEnter).toBeLessThan(1000)
    expect(updates[0].query.filters).toEqual([rule('name', 'Contains', 'bob')])
    // The flushed timer must not fire a second time.
    await sleep(2200)
    expect(updates).toHaveLength(1)
  })
})

describe('C-18 the input while the server answers', () => {
  test('focus and caret stay in the filter input when new rows arrive', async () => {
    const { rerender, filterInput, updates } = await renderTable()
    const input = filterInput('name')
    const el = input.element() as HTMLInputElement
    await userEvent.click(input)
    await userEvent.keyboard('Na')
    await expect.poll(() => updates.length).toBe(1)
    // What a consumer does after it applied the query: replace the rows.
    await rerender({ rows: rows(2), totalRows: 2 })
    expect(document.activeElement).toBe(el)
    await userEvent.keyboard('me')
    expect(el.value).toBe('Name')
    expect(el.selectionStart).toBe(4)
    await expect.poll(() => updates.length).toBe(2)
    await shot('filter-focus-after-rerender')
  })

  test('a query change from outside rewrites the input', async () => {
    const { rerender, filterInput } = await renderTable()
    await rerender({
      query: {
        page: 1,
        pageSize: 10,
        sort: null,
        filters: [rule('name', 'StartsWith', 'zed')]
      }
    })
    await expect
      .poll(() => (filterInput('name').element() as HTMLInputElement).value)
      .toBe('zed*')
  })
})

test('Tab moves focus from one header filter input to the next', async () => {
  const { filterInput } = await renderTable()
  await userEvent.click(filterInput('id'))
  // id input -> id filter button -> name sort button -> name input
  await userEvent.tab()
  await userEvent.tab()
  await userEvent.tab()
  expect(document.activeElement).toBe(filterInput('name').element())
})
