import { describe, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import type { Column, TableQuery } from '@dolusoft/query-table'

import { datasetId } from '../../apps/playground/scenarios/datasets'
import { queryDemoRows } from '../../apps/playground/scenarios/fake-server'
import {
  currentDataset,
  typedColumns
} from '../../apps/playground/scenarios/index'
import DatasetMenu from '../../apps/playground/shell/DatasetMenu.vue'
import { makeQuery, rule } from '../support/fixtures'
import {
  expectUpdates,
  renderScenario,
  type ScenarioUpdate
} from '../support/scenario-host'

// The playground's three demo datasets (Vigil, Ticker, Harbor Goods) have
// different columns and types. The user picks one in the dataset menu, then
// runs the short form of the server scenario on it: filter, sort, next
// page, clear. On each, the skin aligns the cells by `data-type` (C-82).
// The host has `filterDebounce: 0`, so the filter applies at once (C-12).
// tests/support/setup.ts puts the default dataset back before each test.

const datasetNames = [
  ['vigil', 'Vigil'],
  ['ticker', 'Ticker'],
  ['harbor', 'Harbor Goods']
] as const

/** The alignment the test skin gives a column type (C-82). */
const alignOf = (type: string) =>
  type === 'number' || type === 'integer'
    ? 'end'
    : type === 'bool'
      ? 'center'
      : 'start'

const expectTypedCells = (columns: Column[]) => {
  for (const column of columns.filter(entry => !entry.hide)) {
    const type = column.type ?? 'string'
    const cells = [
      ...document.querySelectorAll<HTMLElement>(
        `.qt-table > :is(thead, tbody) > tr > [data-field="${column.field}"]`
      )
    ]
    expect(cells.length, column.field).toBeGreaterThan(1)
    for (const cell of cells) {
      expect(cell.dataset.type, column.field).toBe(type)
      expect(getComputedStyle(cell).textAlign, column.field).toBe(alignOf(type))
    }
  }
  // Utility cells carry no type.
  expect(
    document.querySelector('.qt-table td:not([data-field])[data-type]')
  ).toBeNull()
}

describe('the server scenario on each playground dataset', () => {
  test.each(datasetNames)(
    'C-82 C-12 C-07 C-05 C-22 %s: pick it, filter, sort, next page and clear',
    async (id, name) => {
      // Pick the dataset in the menu; the choice is kept in the browser.
      const menu = await render(DatasetMenu)
      await userEvent.click(page.getByRole('button', { name: /^Demo data/ }))
      await userEvent.click(
        page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) })
      )
      await expect.poll(datasetId).toBe(id)
      expect(localStorage.getItem('query-table-playground:dataset')).toBe(id)
      await menu.unmount()

      const data = currentDataset()
      const allRows = data.createRows()
      const columns = typedColumns(data)
      const flow = await renderScenario({
        allRows,
        columns,
        searchFields: data.searchFields,
        subtable: true
      })
      const expected: ScenarioUpdate[] = []
      const idsOf = (query: TableQuery) =>
        queryDemoRows(allRows, query).rows.map(row => row.id)
      expect(flow.ids()).toEqual(idsOf(makeQuery()))
      expectTypedCells(columns)

      // 1. Filter the main text column.
      const { primary, amount } = data.fields
      await userEvent.fill(flow.filter(primary), data.samples.prefix)
      const filtered = makeQuery({
        filters: [rule(primary, 'Contains', data.samples.prefix)]
      })
      expected.push({ reason: 'filter', query: filtered })
      await expectUpdates(flow.updates, expected)
      const total = queryDemoRows(allRows, filtered).totalRows
      expect(total).toBeGreaterThan(10)
      await expect.poll(flow.ids).toEqual(idsOf(filtered))
      expect(flow.pageInfo()).toBe(`Page 1 of ${Math.ceil(total / 10)}`)

      // 2. Sort by the amount column.
      await userEvent.click(flow.sortButton(amount))
      const sorted = {
        ...filtered,
        sort: { field: amount, direction: 'asc' as const }
      }
      expected.push({ reason: 'sort', query: sorted })
      await expectUpdates(flow.updates, expected)
      await expect.poll(flow.ids).toEqual(idsOf(sorted as TableQuery))

      // 3. Next page.
      await userEvent.click(
        page.getByRole('button', { name: 'Next', exact: true })
      )
      const second = { ...sorted, page: 2 }
      expected.push({ reason: 'page', query: second })
      await expectUpdates(flow.updates, expected)
      await expect.poll(flow.ids).toEqual(idsOf(second as TableQuery))
      expectTypedCells(columns)

      // 4. Clear the filters.
      await userEvent.click(page.getByCSS('.qt-clear-all-button'))
      const cleared = { ...sorted, filters: [] }
      expected.push({ reason: 'reset', query: cleared })
      await expectUpdates(flow.updates, expected)
      await expect.poll(flow.ids).toEqual(idsOf(cleared as TableQuery))
      expectTypedCells(columns)
    }
  )
})
