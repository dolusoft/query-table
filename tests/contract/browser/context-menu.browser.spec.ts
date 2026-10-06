import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, ref } from 'vue'

import QueryTable, { type CellContextMenuPayload } from '@dolusoft/query-table'

import { columns, el, makeQuery, rows, sleep } from '../../support/fixtures'

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
  const actions: object[] = []
  const menu = ref<{ x: number; y: number; row: object } | null>(null)
  let previous: HTMLElement | null = null
  const close = () => {
    menu.value = null
    void nextTick(() => previous?.focus())
  }
  const listener = async (payload: CellContextMenuPayload<object>) => {
    payloads.push(payload)
    targets.push(payload.event.currentTarget)
    previous = document.activeElement as HTMLElement
    menu.value = {
      x: payload.event.clientX,
      y: payload.event.clientY,
      row: payload.row
    }
    await nextTick()
    el<HTMLButtonElement>('[role="menuitem"]').focus()
  }
  const screen = await render(
    defineComponent(
      () => () =>
        h(
          'div',
          {
            onContextmenu: (event: MouseEvent) =>
              observed.push({ event, currentTarget: event.currentTarget }),
            onKeydown: (event: KeyboardEvent) => {
              if (event.key === 'Escape') {
                close()
              }
            }
          },
          [
            h('button', { onClick: close }, 'Outside'),
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
            ),
            menu.value
              ? h(
                  'div',
                  {
                    role: 'menu',
                    style: {
                      position: 'fixed',
                      left: `${menu.value.x}px`,
                      top: `${menu.value.y}px`
                    }
                  },
                  [
                    h(
                      'button',
                      {
                        role: 'menuitem',
                        onClick: () => {
                          actions.push(menu.value!.row)
                          close()
                        }
                      },
                      'Inspect row'
                    )
                  ]
                )
              : null
          ]
        )
    )
  )
  const tbody = screen.container.querySelector('tbody')!
  return { data, cols, payloads, observed, actions, targets, tbody }
}

test('F5 C-28 real right-click supplies the row, original column index and pointer for a consumer menu', async () => {
  const flow = await renderContext()
  const target = page.getByCSS('tr[data-row-index="1"] .age-value')
  await userEvent.click(target)
  const previous = document.activeElement
  const rect = target.element().getBoundingClientRect()
  await userEvent.click(target, { button: 'right', position: { x: 3, y: 3 } })
  await expect.element(page.getByRole('menuitem')).toBeVisible()
  expect(flow.payloads).toHaveLength(1)
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
  const menuRect = el('[role="menu"]').getBoundingClientRect()
  expect(menuRect.left).toBe(payload.event.clientX)
  expect(menuRect.top).toBe(payload.event.clientY)
  await userEvent.click(page.getByRole('menuitem'))
  expect(flow.actions).toEqual([flow.data[1]])
  await expect.poll(() => document.querySelector('[role="menu"]')).toBeNull()
  await expect.poll(() => document.activeElement).toBe(previous)

  await userEvent.click(target, { button: 'right' })
  await expect.element(page.getByRole('menuitem')).toBeVisible()
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => document.querySelector('[role="menu"]')).toBeNull()
  await expect.poll(() => document.activeElement).toBe(previous)
  await userEvent.click(target, { button: 'right' })
  await expect.element(page.getByRole('menuitem')).toBeVisible()
  await userEvent.click(page.getByRole('button', { name: 'Outside' }))
  await expect.poll(() => document.querySelector('[role="menu"]')).toBeNull()
  await expect.poll(() => document.activeElement).toBe(previous)
  await sleep(0)
  expect(flow.payloads).toHaveLength(3)
  expect(flow.actions).toEqual([flow.data[1]])
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
  await expect.element(page.getByRole('menuitem')).toBeVisible()
  await userEvent.keyboard('{Escape}')
  await userEvent.click(target, { button: 'right' })
  await sleep(0)
  expect(flow.observed).toHaveLength(2)
  expect(flow.payloads).toHaveLength(1)
  expect(flow.payloads[0].row).toBe(flow.data[0])
  expect(flow.observed.map(({ event }) => event.defaultPrevented)).toEqual([
    true,
    true
  ])
})
