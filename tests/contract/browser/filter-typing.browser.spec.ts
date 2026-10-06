import { describe, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { renderTable, rows, rule, shot, sleep } from '../../support/helpers'

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
    // Long on purpose: the update can only come from Enter if it arrives
    // before the debounce could have fired, and that bound has to hold even
    // when the machine is slow. Nothing below measures a short wall-clock gap.
    const DEBOUNCE = 3000
    const { filterInput, updates, t0 } = await renderTable({
      filterDebounce: DEBOUNCE
    })
    // Times of the last key and of Enter come from the events themselves, not
    // from when the driver call resolves. The capture listener on the document
    // runs before the table's own handler.
    let lastKeyAt = 0
    let enterAt = Number.POSITIVE_INFINITY
    const input = filterInput('name')
    input
      .element()
      .addEventListener('input', () => (lastKeyAt = performance.now() - t0))
    document.addEventListener(
      'keydown',
      event => {
        if (event.key === 'Enter') {
          enterAt = performance.now() - t0
        }
      },
      true
    )
    await userEvent.click(input)
    await userEvent.keyboard('bob')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => updates.length).toBe(1)
    // Caused by Enter: after the Enter key, and before the debounce of the
    // last key was due.
    expect(updates[0].at).toBeGreaterThanOrEqual(enterAt)
    expect(updates[0].at - lastKeyAt).toBeLessThan(DEBOUNCE)
    expect(updates[0].query.filters).toEqual([rule('name', 'Contains', 'bob')])
    // The flushed timer must not fire a second time: wait until it would have
    // been due, plus a margin.
    await sleep(
      Math.max(0, lastKeyAt + DEBOUNCE + 300 - (performance.now() - t0))
    )
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

describe('C-14 pending text in several inputs before a sort', () => {
  test('one filter update for both inputs, then the sort built on it', async () => {
    // Long enough that neither input applies on its own before the click.
    const { filterInput, updates } = await renderTable({ filterDebounce: 3000 })
    await userEvent.click(filterInput('name'))
    await userEvent.keyboard('ali')
    await userEvent.click(filterInput('age'))
    await userEvent.keyboard('25')
    expect(updates).toHaveLength(0)
    await userEvent.click(page.getByCSS('th[data-field="id"] .qt-sort'))
    await expect.poll(() => updates.length).toBe(2)
    const both = [rule('name', 'Contains', 'ali'), rule('age', 'Equal', 25)]
    expect(updates.map(update => update.reason)).toEqual(['filter', 'sort'])
    expect(updates[0].query.filters).toEqual(both)
    expect(updates[1].query.filters).toEqual(both)
    expect(updates[1].query.sort).toEqual({ field: 'id', direction: 'asc' })
    await sleep(200)
    expect(updates).toHaveLength(2)
  })
})
