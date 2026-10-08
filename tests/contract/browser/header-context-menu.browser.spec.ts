import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import QueryTable, {
  type HeaderContextMenuPayload
} from '@dolusoft/query-table'

import { columns, makeQuery, rows, sleep } from '../../support/fixtures'

// The consumer draws its own menu (C-96); these tests assert only what the
// table supplies: the payload, the listener's currentTarget and whether the
// native menu event is cancelled.
const renderHeaderContext = async (
  mode: 'normal' | 'once' | 'absent' = 'normal',
  props: Record<string, unknown> = {}
) => {
  const cols = columns().map(column => ({
    ...column,
    hide: column.field === 'id'
  }))
  const payloads: HeaderContextMenuPayload[] = []
  const observed: Array<{
    event: MouseEvent
    currentTarget: EventTarget | null
  }> = []
  const targets: Array<EventTarget | null> = []
  const listener = (payload: HeaderContextMenuPayload) => {
    payloads.push(payload)
    targets.push(payload.event.currentTarget)
  }
  const screen = await render(
    defineComponent(
      () => () =>
        h(
          'div',
          {
            onContextmenu: (event: MouseEvent) =>
              observed.push({ event, currentTarget: event.currentTarget })
          },
          [
            h(QueryTable, {
              query: makeQuery(),
              columns: cols,
              rows: rows(3),
              sortable: true,
              filterable: true,
              ...(mode === 'absent'
                ? {}
                : {
                    [mode === 'once'
                      ? 'onHeaderContextMenuOnce'
                      : 'onHeaderContextMenu']: listener
                  }),
              ...props
            })
          ]
        )
    )
  )
  const thead = screen.container.querySelector('thead')!
  return { cols, payloads, observed, targets, thead }
}

test('C-96 real right-click supplies the column, original column index and pointer', async () => {
  const flow = await renderHeaderContext()
  const target = page.getByCSS('thead th[data-field="age"] .qt-sort')
  const rect = target.element().getBoundingClientRect()
  await userEvent.click(target, { button: 'right', position: { x: 3, y: 3 } })
  await expect.poll(() => flow.payloads.length).toBe(1)
  const payload = flow.payloads[0]
  expect(payload.column).toBe(flow.cols[2])
  expect(payload.columnIndex).toBe(2)
  expect(payload.event).toBe(flow.observed[0].event)
  expect(payload.event.defaultPrevented).toBe(true)
  expect(flow.targets).toEqual([flow.thead])
  expect(Math.abs(payload.event.clientX - (rect.left + 3))).toBeLessThanOrEqual(
    1
  )
  expect(Math.abs(payload.event.clientY - (rect.top + 3))).toBeLessThanOrEqual(
    1
  )
  await sleep(0)
  expect(flow.payloads).toHaveLength(1)
})

test('C-96 without a consumer listener a real right-click leaves the native menu event uncancelled', async () => {
  const flow = await renderHeaderContext('absent')
  await userEvent.click(page.getByCSS('thead th[data-field="name"] .qt-sort'), {
    button: 'right'
  })
  expect(flow.observed).toHaveLength(1)
  expect(flow.observed[0].event.isTrusted).toBe(true)
  expect(flow.observed[0].event.defaultPrevented).toBe(false)
})

test('C-96 a once listener receives only the first real right-click and suppresses the native menu', async () => {
  const flow = await renderHeaderContext('once')
  const target = page.getByCSS('thead th[data-field="name"] .qt-sort')
  await userEvent.click(target, { button: 'right' })
  await expect.poll(() => flow.payloads.length).toBe(1)
  await userEvent.click(target, { button: 'right' })
  await expect.poll(() => flow.observed.length).toBe(2)
  await sleep(0)
  expect(flow.payloads).toHaveLength(1)
  expect(flow.observed.map(({ event }) => event.defaultPrevented)).toEqual([
    true,
    true
  ])
})

test('C-96 a real right-click in the filter row emits nothing and keeps the native menu', async () => {
  const flow = await renderHeaderContext()
  await userEvent.click(
    page.getByCSS('thead th[data-field="name"] .qt-filter-input'),
    { button: 'right' }
  )
  expect(flow.observed).toHaveLength(1)
  expect(flow.observed[0].event.defaultPrevented).toBe(false)
  expect(flow.payloads).toHaveLength(0)
})

test.each([
  [
    'clear-all button',
    {
      hasRightPanel: true,
      // The button is disabled with no filter; a disabled control rejects click.
      query: makeQuery({
        filters: [{ field: 'name', condition: 'contains', value: 'x' }]
      })
    },
    '.qt-clear-all-button'
  ],
  ['selection checkbox', { selection: {}, rowKey: 'id' }, '.qt-select-all']
] as const)(
  'C-96 a real right-click on the %s utility header emits nothing and keeps the native menu',
  async (_name, props, selector) => {
    const flow = await renderHeaderContext('normal', {
      filterable: true,
      ...props
    })
    await userEvent.click(page.getByCSS(`thead ${selector}`), {
      button: 'right'
    })
    expect(flow.observed).toHaveLength(1)
    expect(flow.observed[0].event.defaultPrevented).toBe(false)
    expect(flow.payloads).toHaveLength(0)
  }
)
