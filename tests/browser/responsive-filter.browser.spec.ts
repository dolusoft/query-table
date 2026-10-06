import { afterEach, describe, expect, test } from 'vitest'
import { page } from 'vitest/browser'

import { renderTable, shot } from '../support/helpers'

// The filter row at phone and tablet widths, with the test skin: however
// narrow a column gets, its filter input and button stay inside its header
// cell, and the table scrolls inside its own container instead.

const columns = [
  { field: 'id', title: 'ID', type: 'number', width: '50px' },
  { field: 'name', title: 'Name' },
  { field: 'city', title: 'City' },
  { field: 'age', title: 'Age', type: 'number' },
  { field: 'salary', title: 'Salary', type: 'number' },
  { field: 'joined', title: 'Joined', type: 'date' },
  { field: 'active', title: 'Active', type: 'bool' }
]

const overflowing = () => {
  const found: string[] = []
  for (const th of document.querySelectorAll<HTMLElement>('th[data-field]')) {
    const cell = th.getBoundingClientRect()
    for (const control of th.querySelectorAll<HTMLElement>(
      '.qt-filter-input, .qt-filter-button'
    )) {
      const box = control.getBoundingClientRect()
      if (box.width === 0) {
        continue
      }
      if (box.left < cell.left - 0.5 || box.right > cell.right + 0.5) {
        found.push(`${th.dataset.field} ${control.className}`)
      }
    }
  }
  return found
}

describe('C-31 no filter control leaves its header cell at narrow widths', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  for (const width of [375, 768]) {
    test(`${width}px wide`, async () => {
      await page.viewport(width, 800)
      await renderTable({ columns })
      // Every filterable column still has its button.
      expect(document.querySelectorAll('.qt-filter-button')).toHaveLength(
        columns.length - 1
      )
      expect(overflowing()).toEqual([])
      // The page never scrolls sideways; the table container does.
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      await shot(`responsive-filter-${width}`)
    })
  }
})
