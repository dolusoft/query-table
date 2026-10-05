import { afterEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import { el, makeQuery } from './helpers'
import VueServerTable from '../../src/index'

// A cell slot is consumer markup, and a table's most common cell contents are
// a selection checkbox and a link. Their default actions (toggle, navigate)
// must survive a click, which happy-dom cannot show: only a real browser
// applies them.

afterEach(() => {
  window.location.hash = ''
})

const mountWithControls = (onRowClick: (event: MouseEvent) => void) => {
  const Host = defineComponent({
    setup: () => () =>
      h(
        VueServerTable as never,
        {
          query: makeQuery(),
          columns: [
            { field: 'pick', title: 'Pick' },
            { field: 'name', title: 'Name' },
            { field: 'plain', title: 'Plain' }
          ],
          rows: [{ pick: 1, name: 'Ada', plain: 'text' }],
          totalRows: 1,
          pagination: false,
          // Falls through to the root element: clicks on any row bubble here.
          onClick: onRowClick
        },
        {
          'cell-pick': () =>
            h('input', { type: 'checkbox', class: 'pick-box' }),
          'cell-name': () => h('a', { href: '#x', class: 'name-link' }, 'Ada')
        }
      )
  })
  return render(Host)
}

test('C-27 a checkbox in a cell slot toggles when clicked', async () => {
  await mountWithControls(() => {})
  const box = el<HTMLInputElement>('.pick-box')
  expect(box.checked).toBe(false)
  await userEvent.click(box)
  expect(box.checked).toBe(true)
  await userEvent.click(box)
  expect(box.checked).toBe(false)
})

test('C-27 a link in a cell slot keeps its default action', async () => {
  const clicks: MouseEvent[] = []
  await mountWithControls(event => clicks.push(event))
  expect(window.location.hash).toBe('')
  await userEvent.click(el('.name-link'))
  expect(window.location.hash).toBe('#x')
  expect(clicks).toHaveLength(1)
  expect(clicks[0].defaultPrevented).toBe(false)
})

test('C-27 a click in a row still reaches a listener on the table', async () => {
  const clicks: MouseEvent[] = []
  await mountWithControls(event => clicks.push(event))
  await userEvent.click(el('td[data-field="plain"]'))
  await userEvent.click(el('.pick-box'))
  expect(clicks).toHaveLength(2)
  expect(
    clicks.map(event => (event.target as HTMLElement).closest('tr') !== null)
  ).toEqual([true, true])
})
