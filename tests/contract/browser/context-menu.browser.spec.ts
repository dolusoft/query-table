import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import QueryTable, { type CellContextMenuPayload } from '@dolusoft/query-table'

import { columns, makeQuery, rows, sleep } from '../../support/fixtures'

// The consumer draws its own menu (C-28); these tests assert only what the
// table supplies: the payload, the listener's currentTarget and whether the
// native menu event is cancelled.
const renderContext = async (mode: 'normal' | 'once' | 'absent' = 'normal') => {
  const data = rows(3)
  const cols = columns().map(column => ({
    ...column,
    hide: column.field === 'id'
  }))
  const payloads: CellContextMenuPayload<object>[] = []
  const observed: Array<{
    event: MouseEvent
    currentTarget: EventTarget | null
  }> = []
  const targets: Array<EventTarget | null> = []
  const listener = (payload: CellContextMenuPayload<object>) => {
    payloads.push(payload)
    targets.push(payload.event.currentTarget)
  }
  const screen = await render(
    defineComponent(
      () => () =>
        h(
          'div',
          {
            // Bubble phase, so it sees the event after the table's handler.
            onContextmenu: (event: MouseEvent) =>
              observed.push({ event, currentTarget: event.currentTarget })
          },
          [
            h(
              QueryTable,
              {
                query: makeQuery(),
                columns: cols,
                rows: data,
                ...(mode === 'absent'
                  ? {}
                  : {
                      [mode === 'once'
                        ? 'onCellContextMenuOnce'
                        : 'onCellContextMenu']: listener
                    })
              },
              {
                'cell-age': ({ cellValue }: { cellValue: unknown }) =>
                  h(
                    'strong',
                    { class: 'age-value', tabindex: 0 },
                    String(cellValue)
                  )
              }
            )
          ]
        )
    )
  )
  const tbody = screen.container.querySelector('tbody')!
  return { data, cols, payloads, observed, targets, tbody }
}

test('C-28 real right-click supplies the row, original column index and pointer', async () => {
  const flow = await renderContext()
  const target = page.getByCSS('tr[data-row-index="1"] .age-value')
  const rect = target.element().getBoundingClientRect()
  await userEvent.click(target, { button: 'right', position: { x: 3, y: 3 } })
  await expect.poll(() => flow.payloads.length).toBe(1)
  const payload = flow.payloads[0]
  expect(payload.row).toBe(flow.data[1])
  expect(payload.column).toBe(flow.cols[2])
  expect(payload).toMatchObject({ cellValue: 21, rowIndex: 1, columnIndex: 2 })
  expect(payload.event).toBe(flow.observed[0].event)
  expect(payload.event.defaultPrevented).toBe(true)
  expect(payload.event.target).toBe(target.element())
  expect(flow.targets).toEqual([flow.tbody])
  expect(Math.abs(payload.event.clientX - (rect.left + 3))).toBeLessThanOrEqual(
    1
  )
  expect(Math.abs(payload.event.clientY - (rect.top + 3))).toBeLessThanOrEqual(
    1
  )
  await sleep(0)
  expect(flow.payloads).toHaveLength(1)
})

test('C-28 without a consumer listener a real right-click leaves the native menu event uncancelled', async () => {
  const flow = await renderContext('absent')
  await userEvent.click(page.getByCSS('tr[data-row-index="0"] .age-value'), {
    button: 'right'
  })
  expect(flow.observed).toHaveLength(1)
  expect(flow.observed[0].event.isTrusted).toBe(true)
  expect(flow.observed[0].event.defaultPrevented).toBe(false)
})

test('C-28 a once listener receives only the first real right-click and suppresses the native menu', async () => {
  const flow = await renderContext('once')
  const target = page.getByCSS('tr[data-row-index="0"] .age-value')
  await userEvent.click(target, { button: 'right' })
  await expect.poll(() => flow.payloads.length).toBe(1)
  await userEvent.click(target, { button: 'right' })
  await expect.poll(() => flow.observed.length).toBe(2)
  await sleep(0)
  expect(flow.payloads).toHaveLength(1)
  expect(flow.payloads[0].row).toBe(flow.data[0])
  // C-28 cancels the native menu with or without `.once`.
  expect(flow.observed.map(({ event }) => event.defaultPrevented)).toEqual([
    true,
    true
  ])
})
