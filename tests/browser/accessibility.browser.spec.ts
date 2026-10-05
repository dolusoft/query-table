import axe from 'axe-core'
import { describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup } from 'vitest-browser-vue'

import type { Theme } from '../../playground/harness/theme'
import { makeQuery } from '../support/fixtures'
import { columns, renderTable, rule } from '../support/helpers'

// PRINCIPLES.md P7: an automated accessibility scan (axe-core) of the table in
// the states a user meets: filtered and sorted, a row expanded, no rows. The
// scan covers the table root only; the playground skin supplies the colours,
// so a contrast finding belongs to the skin, and it is checked here too
// because the skin is what the playground shows.

const violationsIn = async (selector: string) => {
  const root = document.querySelector(selector)
  expect(root).not.toBeNull()
  const result = await axe.run(root!, { resultTypes: ['violations'] })
  return result.violations.map(
    violation =>
      `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`
  )
}

const everything = {
  hasSubtable: true,
  hasRightPanel: true,
  columns: [...columns(), { field: 'active', title: 'Active', type: 'bool' }]
}

describe.each<Theme>(['light', 'dark'])(
  'C-45 accessibility scan (axe), %s theme',
  theme => {
    test('finds no violation in a filtered, sorted table with an expanded row', async () => {
      await renderTable({
        ...everything,
        theme,
        query: makeQuery({
          sort: { field: 'age', direction: 'desc' },
          filters: [rule('name', 'Contains', 'Name')]
        })
      })
      await userEvent.click(document.querySelector('.qt-expand')!)
      expect(await violationsIn('.qt-datatable')).toEqual([])
      cleanup()
    })

    test('finds no violation without rows', async () => {
      await renderTable({ ...everything, theme, rows: [], totalRows: 0 })
      expect(await violationsIn('.qt-datatable')).toEqual([])
      cleanup()
    })
  }
)
