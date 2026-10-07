import { afterEach, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref, shallowRef } from 'vue'

import QueryTable, {
  type Column,
  type ColumnChangeReason,
  type FilterMenuSlotProps,
  type QueryChangeReason,
  type TableQuery
} from '@dolusoft/query-table'

import { makeQuery, rows } from '../../support/fixtures'

// The layout a user makes (order, widths, pinning, visibility) is the
// consumer's (C-68): a page that keeps it, here in localStorage, gets the
// same table back when the component mounts again, without the table
// keeping anything itself or emitting on mount.

const storageKey = 'query-table-test:column-layout'

afterEach(() => {
  localStorage.removeItem(storageKey)
})

const initialColumns = (): Column[] => [
  { field: 'id', title: 'ID', type: 'number', width: '80px' },
  { field: 'name', title: 'Name', width: '200px' },
  { field: 'age', title: 'Age', type: 'number', width: '120px' },
  { field: 'joined', title: 'Joined', type: 'date', width: '160px' }
]

/**
 * A page that restores its columns from storage, writes every
 * `update:columns` back (`v-model:columns`) and stores it. Its filter menus
 * carry the column controls (C-70).
 */
const renderPage = async () => {
  const stored = localStorage.getItem(storageKey)
  const columns = shallowRef<Column[]>(
    stored ? (JSON.parse(stored) as Column[]) : initialColumns()
  )
  const changes: Array<[Column[], ColumnChangeReason]> = []
  const updates: Array<[TableQuery, QueryChangeReason]> = []
  const query = ref(makeQuery())
  const host = defineComponent(
    () => () =>
      h(
        QueryTable as never,
        {
          query: query.value,
          columns: columns.value,
          rows: rows(),
          totalRows: 5,
          sortable: true,
          filterable: true,
          reorderable: true,
          resizable: true,
          'onUpdate:query': (next: TableQuery, reason: QueryChangeReason) => {
            updates.push([next, reason])
            query.value = next
          },
          'onUpdate:columns': (next: Column[], reason: ColumnChangeReason) => {
            changes.push([next, reason])
            columns.value = next
            localStorage.setItem(storageKey, JSON.stringify(next))
          }
        },
        {
          'filter-menu': (menu: FilterMenuSlotProps) =>
            h('span', { class: 'layout-controls' }, [
              h(
                'button',
                {
                  type: 'button',
                  'aria-label': `Pin ${menu.column.title} left`,
                  onClick: () => menu.control.pin('left')
                },
                'L'
              ),
              h(
                'button',
                {
                  type: 'button',
                  'aria-label': `Pin ${menu.column.title} right`,
                  onClick: () => menu.control.pin('right')
                },
                'R'
              ),
              h(
                'button',
                {
                  type: 'button',
                  'aria-label': `Hide ${menu.column.title}`,
                  onClick: () => menu.control.hide()
                },
                'H'
              )
            ])
        }
      )
  )
  const screen = await render(host)
  return { screen, columns: () => columns.value, changes, updates }
}

const headers = () => [
  ...document.querySelectorAll<HTMLElement>(
    '.qt-table > thead > tr > th[data-field]'
  )
]
/** What the user sees of the layout: field, width, pinned side, in order. */
const drawnLayout = () =>
  headers().map(th => ({
    field: th.dataset.field,
    width: th.style.width,
    pinned: th.dataset.pinned ?? null
  }))
const header = (field: string) =>
  headers().find(th => th.dataset.field === field)!
const bodyOrder = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      '.qt-table > tbody > tr[data-row-index="0"] > td[data-field]'
    )
  ].map(td => td.dataset.field)

test('C-67 C-68 C-69 C-70 C-71 C-73 C-50 a stored column layout comes back as it was after a remount', async () => {
  const first = await renderPage()
  expect(drawnLayout().map(cell => cell.field)).toEqual([
    'id',
    'name',
    'age',
    'joined'
  ])

  // Order: Joined one step to the left with its reorder handle.
  header('joined').querySelector<HTMLElement>('.qt-reorder-handle')!.focus()
  await userEvent.keyboard('{ArrowLeft}')
  await expect
    .poll(() => drawnLayout().map(cell => cell.field))
    .toEqual(['id', 'name', 'joined', 'age'])

  // Width: Name 10px wider by key.
  const nameBefore = Math.round(header('name').getBoundingClientRect().width)
  header('name').querySelector<HTMLElement>('.qt-resize-handle')!.focus()
  await userEvent.keyboard('{ArrowRight}')
  await expect.poll(() => header('name').style.width).not.toBe('200px')
  const nameWidth = header('name').style.width
  expect(Number.parseFloat(nameWidth)).toBeGreaterThan(nameBefore)

  // Pinning: ID to the left, Age to the right.
  await userEvent.click(page.getByRole('button', { name: 'Pin ID left' }))
  await expect.poll(() => header('id').dataset.pinned).toBe('')
  await userEvent.click(page.getByRole('button', { name: 'Pin Age right' }))
  await expect.poll(() => header('age').dataset.pinned).toBe('right')

  // Visibility: Joined hidden.
  await userEvent.click(page.getByRole('button', { name: 'Hide Joined' }))
  await expect.poll(() => header('joined')).toBeUndefined()

  expect(first.changes.map(([, reason]) => reason)).toEqual([
    'order',
    'resize',
    'pin',
    'pin',
    'visibility'
  ])
  expect(first.updates).toEqual([])
  const layout = drawnLayout()
  expect(layout).toEqual([
    { field: 'id', width: '80px', pinned: '' },
    { field: 'name', width: nameWidth, pinned: null },
    { field: 'age', width: '120px', pinned: 'right' }
  ])
  const saved = first.columns()
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual(saved)
  // Hiding keeps the column in its place in the list (C-67).
  expect(saved.find(column => column.field === 'joined')?.hide).toBe(true)
  expect(saved.map(column => column.field)).toEqual([
    'id',
    'name',
    'joined',
    'age'
  ])

  // The component goes away and mounts again from storage.
  await first.screen.unmount()
  expect(document.querySelector('.qt-table')).toBeNull()
  const second = await renderPage()
  expect(drawnLayout()).toEqual(layout)
  expect(bodyOrder()).toEqual(['id', 'name', 'age'])
  expect(header('id').style.getPropertyValue('--qt-pin-left')).not.toBe('')
  expect(header('age').style.getPropertyValue('--qt-pin-right')).toBe('0px')
  // Mounting a stored layout emits nothing (C-68, C-02).
  expect(second.changes).toEqual([])
  expect(second.updates).toEqual([])
  expect(second.columns()).toEqual(saved)
})
