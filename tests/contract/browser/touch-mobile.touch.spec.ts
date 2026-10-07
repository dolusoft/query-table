import { describe, expect, test } from 'vitest'
import { page } from 'vitest/browser'

import { makeQuery, rule } from '../../support/fixtures'
import { createPeople } from '../../support/people'
import {
  expectUpdates,
  pageIds,
  renderScenario
} from '../../support/scenario-host'
import { expectNoPageOverflow, tap } from '../../support/touch'

// A phone: the touch instance of the browser project (390x844, a touch
// screen, a coarse pointer). Every action is a tap. Text goes in with
// `fill()`: one `input` event for the whole text (as an on-screen keyboard's
// suggestion does), not key by key.

const people = createPeople()

describe('touch screen at 390 wide', () => {
  test('the page is a phone: 390 wide, a coarse pointer, touch events', () => {
    expect(window.innerWidth).toBe(390)
    expect(matchMedia('(pointer: coarse)').matches).toBe(true)
    expect(navigator.maxTouchPoints).toBeGreaterThan(0)
  })

  test('C-07 a tap on a header sorts, a second tap sorts descending', async () => {
    const flow = await renderScenario({ subtable: true })
    expectNoPageOverflow()
    await tap('th[data-field="age"] .qt-sort')
    const asc = makeQuery({ sort: { field: 'age', direction: 'asc' } })
    await expectUpdates(flow.updates, [{ reason: 'sort', query: asc }])
    await tap('th[data-field="age"] .qt-sort')
    const desc = makeQuery({ sort: { field: 'age', direction: 'desc' } })
    await expectUpdates(flow.updates, [
      { reason: 'sort', query: asc },
      { reason: 'sort', query: desc }
    ])
    await expect
      .element(page.getByCSS('th[data-field="age"]'))
      .toHaveAttribute('aria-sort', 'descending')
    expectNoPageOverflow()
  })

  test('C-12 a tap focuses a filter input and typed text filters', async () => {
    const flow = await renderScenario({ subtable: true })
    await tap('th[data-field="name"] .qt-filter-input')
    expect(document.activeElement).toBe(
      document.querySelector('th[data-field="name"] .qt-filter-input')
    )
    await page.getByCSS('th[data-field="name"] .qt-filter-input').fill('Bob')
    await expectUpdates(flow.updates, [
      {
        reason: 'filter',
        query: makeQuery({ filters: [rule('name', 'Contains', 'Bob')] })
      }
    ])
    const bob = people.filter(person => person.name === 'Bob')
    await expect.poll(flow.ids).toEqual(pageIds(bob, 1, 10))
    expectNoPageOverflow()
  })

  test('C-26 a tap opens a row and a second tap closes it, no query emitted', async () => {
    const flow = await renderScenario({ subtable: true })
    await tap('tr[data-row-index="2"] .qt-expand')
    await expect.poll(flow.expandedIds).toEqual([3])
    await expect
      .element(page.getByText('Detail of 3', { exact: true }))
      .toBeVisible()
    expectNoPageOverflow()
    await tap('tr[data-row-index="2"] .qt-expand')
    await expect.poll(flow.expandedIds).toEqual([])
    await expectUpdates(flow.updates, [])
  })

  test('C-05 C-06 a tap on Next pages, the page size select goes back to page 1', async () => {
    const flow = await renderScenario({ subtable: true })
    await tap('.next-page')
    await expectUpdates(flow.updates, [
      { reason: 'page', query: makeQuery({ page: 2 }) }
    ])
    await expect.poll(flow.ids).toEqual(pageIds(people, 2, 10))
    await tap('.previous-page')
    await expectUpdates(flow.updates, [
      { reason: 'page', query: makeQuery({ page: 2 }) },
      { reason: 'page', query: makeQuery() }
    ])
    await expect.poll(flow.ids).toEqual(pageIds(people, 1, 10))
    // A tap on the native `<select>` opens the system picker, which is not
    // part of the page and cannot be tapped; the option is picked as the
    // picker does it, with `selectOptions`.
    await tap('.qt-pagination select')
    await page
      .getByRole('combobox', { name: 'Rows per page' })
      .selectOptions('5')
    await expectUpdates(flow.updates, [
      { reason: 'page', query: makeQuery({ page: 2 }) },
      { reason: 'page', query: makeQuery() },
      { reason: 'pageSize', query: makeQuery({ pageSize: 5 }) }
    ])
    await expect.poll(flow.ids).toEqual(pageIds(people, 1, 5))
    expectNoPageOverflow()
  })

  test('the table scrolls sideways inside its own box, the page does not', async () => {
    await renderScenario({ subtable: true, selection: true, rightPanel: true })
    const scroller = document.querySelector<HTMLElement>(
      '.qt-table-responsive'
    )!
    expect(scroller.getBoundingClientRect().right).toBeLessThanOrEqual(390)
    // The table is wider than the phone, so there is something to scroll.
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
    expect(scroller.scrollLeft).toBe(0)
    expectNoPageOverflow()
    // The last column can be reached: tapping its sort button scrolls the
    // box, not the page.
    await tap('th[data-field="joined"] .qt-sort')
    expect(scroller.scrollLeft).toBeGreaterThan(0)
    expectNoPageOverflow()
    const joined = document
      .querySelector('th[data-field="joined"] .qt-sort')!
      .getBoundingClientRect()
    expect(joined.right).toBeLessThanOrEqual(390)
    expect(joined.left).toBeGreaterThanOrEqual(0)
  })
})
