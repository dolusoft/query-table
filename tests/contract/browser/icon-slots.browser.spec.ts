import axe from 'axe-core'
import { afterEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup } from 'vitest-browser-vue'
import { h } from 'vue'

import { renderColumnsTable } from '../../support/columns-host'

// C-131 in a real browser: with the consumer's icons the buttons keep their
// keys, listeners and names, and the table stays accessible. Not compared
// with a 3.20 baseline (`ADDED_AFTER_BASELINE`).

afterEach(() => {
  cleanup()
})

/** A decorative icon of the consumer's set. */
const svgIcon = (name: string) => () =>
  h(
    'svg',
    {
      class: `my-${name}`,
      'aria-hidden': 'true',
      width: 14,
      height: 14,
      viewBox: '0 0 16 16'
    },
    [h('circle', { cx: 8, cy: 8, r: 4 })]
  )

const header = (field: string) =>
  document.querySelector<HTMLElement>(`thead th[data-field="${field}"]`)!

test('C-131 with icon slots the reorder handle, the sort and expand buttons still work and the table passes an axe scan [own]', async () => {
  const { columns } = await renderColumnsTable(
    { reorderable: true, hasSubtable: true, hasRightPanel: true },
    {
      slots: {
        'icon-reorder': svgIcon('grip'),
        'icon-sort': svgIcon('sort'),
        'icon-expand': svgIcon('expand'),
        'icon-right-panel': svgIcon('panel'),
        'icon-clear-all': svgIcon('clear')
      }
    }
  )

  // The reorder handle: the consumer's grip, the table's keys.
  const handle = header('name').querySelector<HTMLElement>(
    ':scope > .qt-reorder-handle'
  )!
  expect(handle.querySelector('.my-grip')).not.toBeNull()
  expect(handle.querySelectorAll('svg')).toHaveLength(1)
  handle.focus()
  await userEvent.keyboard('{ArrowRight}')
  await expect
    .poll(() => columns().map(column => column.field))
    .toEqual(['id', 'age', 'name', 'joined'])

  // The sort button: the consumer's icon, the table's click.
  const sort = header('age').querySelector<HTMLElement>('.qt-sort')!
  expect(sort.querySelector('.my-sort')).not.toBeNull()
  expect(sort.querySelector('.qt-sort-icon')).toBeNull()
  await userEvent.click(sort)
  await expect
    .poll(() => header('age').getAttribute('aria-sort'))
    .toBe('ascending')

  // The expand button: the consumer's chevron, the table's key.
  const expand = () =>
    document.querySelector<HTMLButtonElement>(
      'tbody > tr[data-row-index="0"] .qt-expand'
    )!
  expect(expand().querySelector('.my-expand')).not.toBeNull()
  expand().focus()
  await userEvent.keyboard('{Enter}')
  await expect.poll(() => expand().getAttribute('aria-expanded')).toBe('true')

  const root = document.querySelector<HTMLElement>('.qt-datatable')!
  const result = await axe.run(root, { resultTypes: ['violations'] })
  expect(
    result.violations.map(
      violation =>
        `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`
    )
  ).toEqual([])
})
