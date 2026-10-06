import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { computed, defineComponent, h, ref } from 'vue'

import QueryTable, {
  type PaginationSlotProps,
  type QueryTableExpose,
  type TableQuery
} from '@dolusoft/query-table'

import TablePager from '../../../apps/playground/harness/TablePager.vue'
import { columns, el, makeQuery, rows, sleep } from '../../support/fixtures'

// A consumer example: sorting and paging supply new rows; pinning is a prop.
const renderExpansion = async (
  options: {
    keyed?: boolean
    pinned?: boolean
    rowPinned?: boolean
    hasSubtable?: boolean
  } = {}
) => {
  const query = ref(makeQuery({ pageSize: 3 }))
  const table = ref<QueryTableExpose | null>(null)
  const updates: TableQuery[] = []
  const data = rows(6)
  const shown = computed(() => {
    const current = data.slice((query.value.page - 1) * 3, query.value.page * 3)
    return query.value.sort ? current.reverse() : current
  })
  let mounts = 0
  const Detail = defineComponent({
    props: { id: { type: Number, required: true } },
    setup: props => {
      const mount = ++mounts
      return () =>
        h('input', {
          class: 'detail',
          'aria-label': `Detail ${props.id}`,
          'data-id': props.id,
          'data-mount': mount
        })
    }
  })
  await render(
    defineComponent(
      () => () =>
        h(
          QueryTable as never,
          {
            ref: table,
            query: query.value,
            columns: columns().map((column, index) =>
              options.pinned && index === 0
                ? { ...column, pinned: 'left' as const }
                : column
            ),
            rows: shown.value,
            totalRows: 6,
            rowKey: options.keyed === false ? undefined : 'id',
            rowPinning: options.rowPinned
              ? { top: ['2'], bottom: ['1'] }
              : undefined,
            hasSubtable: options.hasSubtable ?? true,
            sortable: true,
            'onUpdate:query': (next: TableQuery) => {
              updates.push(next)
              query.value = next
            }
          },
          {
            subtable: ({ row }: { row: object }) =>
              h(Detail, { id: (row as { id: number }).id }),
            pagination: (pager: PaginationSlotProps) =>
              h(TablePager, { page: pager })
          }
        )
    )
  )
  return { table, updates }
}

const toggle = (index: number) =>
  page.getByCSS(`tr[data-row-index="${index}"] .qt-expand`)
const details = () =>
  [...document.querySelectorAll('.detail')].map(detail =>
    Number(detail.getAttribute('data-id'))
  )
const assertUnder = (id: number) => {
  const detail = el(`.detail[data-id="${id}"]`).closest('tr')!
  const parent = detail.previousElementSibling!
  expect(parent.querySelector('td[data-field="id"]')?.textContent).toBe(
    String(id)
  )
  expect(parent).toHaveAttribute('data-expanded')
  expect(detail.querySelector('td')?.colSpan).toBe(parent.children.length)
}

test('F4 C-26 mouse, Enter and Space expand and collapse content under its row', async () => {
  const flow = await renderExpansion()
  await userEvent.click(toggle(1))
  await expect.poll(details).toEqual([2])
  assertUnder(2)
  await expect.element(toggle(1)).toHaveAttribute('aria-expanded', 'true')
  await userEvent.click(toggle(1))
  await expect.poll(details).toEqual([])
  el<HTMLButtonElement>('tr[data-row-index="1"] .qt-expand').focus()
  for (const key of ['{Enter}', ' ']) {
    await userEvent.keyboard(key)
    await expect.poll(details).toEqual([2])
    assertUnder(2)
    await userEvent.keyboard(key)
    await expect.poll(details).toEqual([])
    await expect.element(toggle(1)).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(el('tr[data-row-index="1"] .qt-expand'))
  }
  await sleep(0)
  expect(flow.updates).toEqual([])
})

test('F4 C-26 keyed detail state follows a sorted row and is pruned on a page round-trip', async () => {
  await renderExpansion()
  await userEvent.click(toggle(0))
  await expect.poll(details).toEqual([1])
  const input = el<HTMLInputElement>('.detail')
  const mount = input.getAttribute('data-mount')
  await userEvent.fill(input, 'kept with row 1')
  await userEvent.click(page.getByCSS('th[data-field="id"] .qt-sort'))
  await expect
    .poll(() =>
      el('.detail')
        .closest('tr')
        ?.previousElementSibling?.getAttribute('data-row-index')
    )
    .toBe('2')
  assertUnder(1)
  expect(el('.detail')).toBe(input)
  expect(el('.detail').getAttribute('data-mount')).toBe(mount)
  await expect
    .element(page.getByRole('textbox', { name: 'Detail 1' }))
    .toHaveValue('kept with row 1')
  await userEvent.click(page.getByRole('button', { name: 'Next', exact: true }))
  await expect.poll(details).toEqual([])
  await userEvent.click(
    page.getByRole('button', { name: 'Previous', exact: true })
  )
  await expect
    .element(page.getByCSS('tr[data-row-index="2"] td[data-field="id"]'))
    .toHaveTextContent('1')
  await expect.element(toggle(2)).toHaveAttribute('aria-expanded', 'false')
  expect(details()).toEqual([])
})

test('F4 C-26 unkeyed expansion resets when sorting or paging replaces rows', async () => {
  await renderExpansion({ keyed: false })
  await userEvent.click(toggle(0))
  await expect.poll(details).toEqual([1])
  await userEvent.click(page.getByCSS('th[data-field="id"] .qt-sort'))
  await expect
    .element(page.getByCSS('tr[data-row-index="0"] td[data-field="id"]'))
    .toHaveTextContent('3')
  expect(details()).toEqual([])
  await userEvent.click(toggle(0))
  await expect.poll(details).toEqual([3])
  await userEvent.click(page.getByRole('button', { name: 'Next', exact: true }))
  await expect.poll(details).toEqual([])
})

test('F4 C-26 C-55 left-pinned column details span all columns and expandAll opens only supplied rows with page pruning', async () => {
  const flow = await renderExpansion({ pinned: true })
  flow.table.value!.expandAll()
  await expect.poll(details).toEqual([1, 2, 3])
  for (const id of [1, 2, 3]) {
    assertUnder(id)
  }
  expect(el('td[data-field="id"]')).toHaveAttribute('data-pinned', '')
  await sleep(0)
  expect(flow.updates).toEqual([])
  await userEvent.click(page.getByRole('button', { name: 'Next', exact: true }))
  await expect
    .element(page.getByCSS('tr[data-row-index="0"] td[data-field="id"]'))
    .toHaveTextContent('4')
  expect(details()).toEqual([])
  flow.table.value!.expandAll()
  await expect.poll(details).toEqual([4, 5, 6])
  await sleep(0)
  expect(flow.updates).toHaveLength(1)
  await userEvent.click(
    page.getByRole('button', { name: 'Previous', exact: true })
  )
  await expect
    .element(page.getByCSS('tr[data-row-index="0"] td[data-field="id"]'))
    .toHaveTextContent('1')
  for (const index of [0, 1, 2]) {
    await expect
      .element(toggle(index))
      .toHaveAttribute('aria-expanded', 'false')
  }
  expect(details()).toEqual([])
})

test('F4 C-74 row-pinned details follow their row with the same data-pinned-row placement', async () => {
  await renderExpansion({ rowPinned: true })
  for (const [index, id, position] of [
    [1, 2, 'top'],
    [0, 1, 'bottom']
  ] as const) {
    await userEvent.click(toggle(index))
    await expect
      .element(page.getByCSS(`.detail[data-id="${id}"]`))
      .toBeVisible()
    const detailRow = el(`.detail[data-id="${id}"]`).closest('tr')!
    expect(detailRow).toHaveAttribute('data-pinned-row', position)
    expect(detailRow.previousElementSibling).toHaveAttribute(
      'data-pinned-row',
      position
    )
    expect(
      detailRow.previousElementSibling?.querySelector('td[data-field="id"]')
        ?.textContent
    ).toBe(String(id))
  }
})

test('F4 C-26 C-33 collapseAll closes open rows without emitting a query', async () => {
  const flow = await renderExpansion()
  await userEvent.click(toggle(0))
  await userEvent.click(toggle(2))
  await expect.poll(details).toEqual([1, 3])
  flow.table.value!.collapseAll()
  await expect.poll(details).toEqual([])
  for (const index of [0, 2]) {
    await expect
      .element(toggle(index))
      .toHaveAttribute('aria-expanded', 'false')
  }
  await sleep(0)
  expect(flow.updates).toEqual([])
})

test('F4 C-55 expandAll does nothing without hasSubtable', async () => {
  const flow = await renderExpansion({ hasSubtable: false })
  flow.table.value!.expandAll()
  await sleep(0)
  expect(details()).toEqual([])
  expect(document.querySelectorAll('tr[data-expanded]')).toHaveLength(0)
  expect(flow.updates).toEqual([])
})
