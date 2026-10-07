import { expect, test } from 'vitest'
import { render } from 'vitest-browser-vue'
import { h } from 'vue'

import QueryTable, { type FilterMenuSlotProps } from '@dolusoft/query-table'

import { columns, makeQuery, rows } from '../../support/fixtures'

// The test skin with a mouse (`pointer: fine`): the 44px touch targets of
// apps/playground/skin/mapping.css stay off and the controls keep the
// compact shadcn sizes. The touch side is touch-targets.touch.spec.ts.

// Pinned to the playground's look on a desktop: the targets a mouse gets.
const FINE = {
  '.qt-clear-all-button': { width: 24, height: 24 },
  '.qt-expand': { width: 24, height: 24 },
  '.qt-right-panel-button': { width: 24, height: 24 },
  '.qt-filter-button': { width: 32, height: 32 }
}

test('with a mouse the controls keep their compact size', async () => {
  expect(matchMedia('(pointer: fine)').matches).toBe(true)
  await render(QueryTable as never, {
    props: {
      columns: columns().map(column => ({ ...column, width: '12rem' })),
      rows: rows(3),
      totalRows: 3,
      query: makeQuery(),
      rowKey: 'id',
      sortable: true,
      filterable: true,
      reorderable: true,
      hasRightPanel: true,
      hasSubtable: true,
      selection: {}
    } as never,
    slots: {
      'filter-menu': (menu: FilterMenuSlotProps) => h(menu.trigger),
      subtable: () => h('p', 'Details')
    }
  })
  for (const [selector, size] of Object.entries(FINE)) {
    const rect = document
      .querySelector<HTMLElement>(selector)!
      .getBoundingClientRect()
    expect({ width: rect.width, height: rect.height }, selector).toEqual(size)
  }
  const checkbox = document
    .querySelector<HTMLElement>('.qt-select-row')!
    .getBoundingClientRect()
  expect(checkbox.width).toBeLessThan(20)
})
