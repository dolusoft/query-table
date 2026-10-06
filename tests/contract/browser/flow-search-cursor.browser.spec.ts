import { afterEach, describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { nextTick } from 'vue'

import { makeQuery, rule } from '../../support/fixtures'
import { cursorQuery, renderServerFlow } from '../../support/server-flow'

afterEach(() => vi.useRealTimers())

describe('F2 F7 server search and cursor flows', () => {
  test('F2 C-58 C-63 search bursts debounce once, restart on page one and remove an empty search', async () => {
    const flow = await renderServerFlow(makeQuery({ page: 3 }), {
      searchDebounce: 300
    })
    // Fake only the debounce clock. Playwright still drives real browser input
    // events; no assertion depends on the time taken by a driver round trip.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const search = page.getByRole('searchbox')
    await userEvent.fill(search, 'bu')
    await vi.advanceTimersByTimeAsync(200)
    await userEvent.fill(search, 'bursa')
    await vi.advanceTimersByTimeAsync(299)
    expect(flow.updates).toEqual([])
    expect(flow.requests).toHaveLength(1)
    expect((search.element() as HTMLInputElement).value).toBe('bursa')
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(flow.updates).toEqual([
      { reason: 'search', query: makeQuery({ search: 'bursa' }) }
    ])
    await vi.advanceTimersByTimeAsync(0)
    expect(flow.updates).toHaveLength(1)
    expect(flow.ids()).toEqual([4, 9, 14, 19, 24, 29, 34, 39, 44, 49])

    await userEvent.fill(search, 'alice')
    await vi.advanceTimersByTimeAsync(300)
    await nextTick()
    expect(flow.updates[1]).toEqual({
      reason: 'search',
      query: makeQuery({ search: 'alice' })
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(flow.updates).toHaveLength(2)
    expect(flow.ids()).toEqual([2, 17, 32, 47, 62, 77, 92, 107, 122, 137])
    await userEvent.fill(search, 'pending')
    await vi.advanceTimersByTimeAsync(299)
    expect(flow.updates).toHaveLength(2)
    await userEvent.fill(search, '')
    await nextTick()
    expect(flow.updates[2]).toEqual({ reason: 'search', query: makeQuery() })
    expect(flow.updates[2].query).not.toHaveProperty('search')
    await vi.advanceTimersByTimeAsync(0)
    expect(flow.updates).toHaveLength(3)
    // The canceled timer must not emit later; setting the same text is quiet.
    await userEvent.fill(search, '')
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()
    expect(flow.updates).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(0)
    expect(flow.updates).toHaveLength(3)
    expect(flow.requests).toEqual([
      makeQuery({ page: 3 }),
      makeQuery({ search: 'bursa' }),
      makeQuery({ search: 'alice' }),
      makeQuery()
    ])
  })

  test('F2 C-22 C-58 search and column filters compose; clear-all keeps search, sort and size', async () => {
    const flow = await renderServerFlow(
      makeQuery({ page: 2, sort: { field: 'id', direction: 'desc' } })
    )
    await userEvent.fill(page.getByRole('searchbox'), 'bursa')
    await expect.poll(() => flow.updates.length).toBe(1)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(flow.updates).toHaveLength(1)
    const searched = makeQuery({
      search: 'bursa',
      sort: { field: 'id', direction: 'desc' }
    })
    expect(flow.updates[0]).toEqual({ reason: 'search', query: searched })
    await userEvent.fill(flow.filter('name'), 'Alice')
    await expect.poll(() => flow.updates.length).toBe(2)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(flow.updates).toHaveLength(2)
    const filtered = {
      ...searched,
      filters: [rule('name', 'Contains', 'Alice')]
    }
    expect(flow.updates[1]).toEqual({ reason: 'filter', query: filtered })
    await expect
      .element(page.getByText('No results.', { exact: true }))
      .toBeVisible()
    await userEvent.click(page.getByCSS('.qt-clear-all-button'))
    await expect.poll(() => flow.updates.length).toBe(3)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(flow.updates).toHaveLength(3)
    expect(flow.updates[2]).toEqual({ reason: 'reset', query: searched })
    expect(flow.ids()).toEqual([
      199, 194, 189, 184, 179, 174, 169, 164, 159, 154
    ])
    await expect.element(page.getByRole('searchbox')).toHaveValue('bursa')
    await expect.element(flow.filter('name')).toHaveValue('')
    await expect.element(page.getByCSS('.qt-clear-all-button')).toBeDisabled()
    expect(flow.requests).toEqual([
      makeQuery({ page: 2, sort: { field: 'id', direction: 'desc' } }),
      searched,
      filtered,
      searched
    ])
  })

  test('F7 C-56 C-65 cursor controls follow server tokens, have no total and disable next on the last page', async () => {
    const initial = cursorQuery({ search: 'Alice' })
    const flow = await renderServerFlow(initial)
    const previous = page.getByRole('button', { name: 'Previous', exact: true })
    const next = page.getByRole('button', { name: 'Next', exact: true })
    await expect.element(previous).toBeDisabled()
    await expect
      .element(page.getByCSS('.page-info'))
      .toHaveTextContent('Cursor paging')
    await expect
      .element(page.getByCSS('.server-total'))
      .toHaveTextContent('null')
    expect(flow.ids()).toEqual([2, 17, 32, 47, 62, 77, 92, 107, 122, 137])
    await userEvent.click(next)
    await expect.poll(() => flow.updates.length).toBe(1)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(flow.updates).toHaveLength(1)
    const forward = {
      ...initial,
      cursor: { token: btoa('10'), direction: 'next' as const }
    }
    expect(flow.updates[0]).toEqual({ reason: 'page', query: forward })
    expect(flow.ids()).toEqual([152, 167, 182, 197])
    await expect.element(next).toBeDisabled()
    await expect.element(previous).toBeEnabled()
    await userEvent.click(previous)
    await expect.poll(() => flow.updates.length).toBe(2)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(flow.updates).toHaveLength(2)
    const backward = {
      ...initial,
      cursor: { token: btoa('0'), direction: 'prev' as const }
    }
    expect(flow.updates[1]).toEqual({ reason: 'page', query: backward })
    expect(flow.ids()).toEqual([2, 17, 32, 47, 62, 77, 92, 107, 122, 137])
    await expect.element(previous).toBeDisabled()
    expect(flow.requests).toEqual([initial, forward, backward])
  })

  describe('F7 C-57 C-65 cursor invalidation after walking to the second page', () => {
    test.each(['sort', 'filter', 'search', 'pageSize', 'reset'] as const)(
      '%s sends one cursor:null query and renders the first server page',
      async action => {
        const initial = cursorQuery({
          filters: [rule('age', 'GreaterThanOrEqual', 22)]
        })
        const flow = await renderServerFlow(initial)
        await userEvent.click(
          page.getByRole('button', { name: 'Next', exact: true })
        )
        await expect.poll(() => flow.updates.length).toBe(1)
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(flow.updates).toHaveLength(1)
        expect(flow.updates[0]).toEqual({
          reason: 'page',
          query: {
            ...initial,
            cursor: { token: btoa('10'), direction: 'next' }
          }
        })
        expect(flow.ids()[0]).toBe(11)
        let expected = initial
        let firstIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        switch (action) {
          case 'sort':
            await userEvent.click(
              page.getByCSS('th[data-field="age"] .qt-sort')
            )
            expected = { ...initial, sort: { field: 'age', direction: 'asc' } }
            firstIds = [1, 31, 61, 91, 121, 151, 181, 14, 44, 74]
            break
          case 'filter':
            await userEvent.fill(flow.filter('name'), 'Alice')
            expected = {
              ...initial,
              filters: [...initial.filters, rule('name', 'Contains', 'Alice')]
            }
            firstIds = [2, 17, 32, 47, 62, 77, 92, 107, 122, 137]
            break
          case 'search':
            await userEvent.fill(page.getByRole('searchbox'), 'Bursa')
            expected = { ...initial, search: 'Bursa' }
            firstIds = [4, 9, 14, 19, 24, 29, 34, 39, 44, 49]
            break
          case 'pageSize':
            await userEvent.selectOptions(
              page.getByRole('combobox', { name: 'Rows per page' }),
              '5'
            )
            expected = { ...initial, pageSize: 5 }
            firstIds = [1, 2, 3, 4, 5]
            break
          case 'reset':
            await userEvent.click(page.getByCSS('.qt-clear-all-button'))
            expected = { ...initial, filters: [] }
            break
        }
        await expect.poll(() => flow.updates.length).toBe(2)
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(flow.updates).toHaveLength(2)
        expect(flow.updates[1]).toEqual({ reason: action, query: expected })
        expect(flow.updates[1].query).not.toHaveProperty('page')
        expect(flow.ids()).toEqual(firstIds)
        await expect
          .element(page.getByRole('button', { name: 'Previous', exact: true }))
          .toBeDisabled()
        await expect
          .element(page.getByCSS('.server-total'))
          .toHaveTextContent('null')
        await expect
          .element(page.getByCSS('.server-page-count'))
          .toHaveTextContent('null')
        await expect
          .element(page.getByCSS('.server-page'))
          .toHaveTextContent('1')
        expect(flow.requests).toEqual([
          initial,
          flow.updates[0].query,
          expected
        ])
      }
    )
  })
})
