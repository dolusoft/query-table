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

// A table with a listener whose tbody is asked about places other than a data
// cell. `rows` and the extra props vary per test; the listener is the same.
const renderListening = async (
  props: Record<string, unknown>,
  slots: Record<string, (...args: never[]) => unknown> = {}
) => {
  const payloads: CellContextMenuPayload<object>[] = []
  const observed: MouseEvent[] = []
  await render(
    defineComponent(
      () => () =>
        h(
          'div',
          { onContextmenu: (event: MouseEvent) => observed.push(event) },
          [
            h(
              QueryTable,
              {
                query: makeQuery(),
                columns: columns(),
                onCellContextMenu: (payload: CellContextMenuPayload<object>) =>
                  payloads.push(payload),
                ...props
              },
              slots
            )
          ]
        )
    )
  )
  return { payloads, observed }
}

test('C-28 a real right-click on a utility cell emits nothing and keeps the native menu', async () => {
  const flow = await renderListening({ rows: rows(2), hasSubtable: true })
  await userEvent.click(page.getByCSS('tr[data-row-index="0"] .qt-expand'), {
    button: 'right'
  })
  expect(flow.observed).toHaveLength(1)
  expect(flow.observed[0].defaultPrevented).toBe(false)
  expect(flow.payloads).toHaveLength(0)
})

test('C-28 a real right-click in the subtable row emits nothing for the outer table', async () => {
  const flow = await renderListening(
    { rows: rows(2), hasSubtable: true },
    { subtable: () => h('p', { class: 'detail' }, 'detail') }
  )
  await userEvent.click(page.getByCSS('tr[data-row-index="0"] .qt-expand'))
  await expect.element(page.getByCSS('.qt-subtable-row .detail')).toBeVisible()
  await userEvent.click(page.getByCSS('.qt-subtable-row .detail'), {
    button: 'right'
  })
  expect(flow.observed).toHaveLength(1)
  expect(flow.observed[0].defaultPrevented).toBe(false)
  expect(flow.payloads).toHaveLength(0)
})

test('C-28 a real right-click on an empty table emits nothing and keeps the native menu', async () => {
  const flow = await renderListening(
    { rows: [] },
    { empty: () => h('i', { class: 'none' }, 'nothing') }
  )
  await userEvent.click(page.getByCSS('.qt-empty-row .none'), {
    button: 'right'
  })
  expect(flow.observed).toHaveLength(1)
  expect(flow.observed[0].defaultPrevented).toBe(false)
  expect(flow.payloads).toHaveLength(0)
})

test('C-28 a table nested in a subtable slot answers for its own cells only', async () => {
  const inner: CellContextMenuPayload<object>[] = []
  const flow = await renderListening(
    { rows: rows(1), hasSubtable: true },
    {
      subtable: () =>
        h(QueryTable, {
          query: makeQuery(),
          columns: [{ field: 'label', title: 'Label' }],
          rows: [{ label: 'inner' }],
          onCellContextMenu: (payload: CellContextMenuPayload<object>) =>
            inner.push(payload)
        })
    }
  )
  await userEvent.click(page.getByCSS('tr[data-row-index="0"] .qt-expand'))
  const cell = page.getByCSS('.qt-subtable-row td[data-field="label"]')
  await expect.element(cell).toBeVisible()
  await userEvent.click(cell, { button: 'right' })
  await expect.poll(() => inner.length).toBe(1)
  expect(inner[0].cellValue).toBe('inner')
  expect(flow.payloads).toHaveLength(0)
  expect(flow.observed.map(event => event.defaultPrevented)).toEqual([true])
})

test('C-28 a table nested in a cell slot emits for its own cell, then the outer table for the cell that holds it', async () => {
  const inner: CellContextMenuPayload<object>[] = []
  const flow = await renderListening(
    { rows: rows(2), columns: columns().slice(0, 2) },
    {
      'cell-name': () =>
        h(QueryTable, {
          query: makeQuery(),
          columns: [{ field: 'label', title: 'Label' }],
          rows: [{ label: 'inner' }],
          onCellContextMenu: (payload: CellContextMenuPayload<object>) =>
            inner.push(payload)
        })
    }
  )
  await userEvent.click(
    page.getByCSS('tr[data-row-index="1"] td[data-field="label"]'),
    { button: 'right' }
  )
  await expect.poll(() => flow.payloads.length).toBe(1)
  expect(inner).toHaveLength(1)
  expect(inner[0].column.field).toBe('label')
  expect(flow.payloads[0].column.field).toBe('name')
  expect(flow.payloads[0].rowIndex).toBe(1)
  expect(flow.payloads[0].event).toBe(inner[0].event)
})
