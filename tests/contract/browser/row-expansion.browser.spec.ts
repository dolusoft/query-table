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
import { columns, el, makeQuery, rows } from '../../support/fixtures'

// A consumer example: sorting and paging supply new rows; pinning is a prop.
const renderExpansion = async (
  options: { keyed?: boolean; pinned?: boolean } = {}
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
            rowPinning: options.pinned
              ? { top: ['2'], bottom: ['1'] }
              : undefined,
            hasSubtable: true,
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
  await new Promise(resolve => setTimeout(resolve, 0))
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
  await userEvent.click(
    page.getByRole('button', { name: 'Previous', exact: true })
  )
  await expect.element(toggle(0)).toHaveAttribute('aria-expanded', 'false')
})

test('F4 C-26 C-55 pinned rows keep adjacent full-width details and expandAll opens only supplied rows', async () => {
  const flow = await renderExpansion({ pinned: true })
  flow.table.value!.expandAll()
  await expect.poll(details).toEqual([2, 3, 1])
  for (const id of [2, 3, 1]) {
    assertUnder(id)
  }
  for (const [id, position] of [
    [2, 'top'],
    [1, 'bottom']
  ] as const) {
    const detailRow = el(`.detail[data-id="${id}"]`).closest('tr')!
    expect(detailRow).toHaveAttribute('data-pinned-row', position)
    expect(detailRow.previousElementSibling).toHaveAttribute(
      'data-pinned-row',
      position
    )
  }
  expect(el('td[data-field="id"]')).toHaveAttribute('data-pinned', '')
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toEqual([])
  await userEvent.click(page.getByRole('button', { name: 'Next', exact: true }))
  await expect
    .element(page.getByCSS('tr[data-row-index="0"] td[data-field="id"]'))
    .toHaveTextContent('4')
  expect(details()).toEqual([])
  flow.table.value!.expandAll()
  await expect.poll(details).toEqual([4, 5, 6])
  flow.table.value!.collapseAll()
  await expect.poll(details).toEqual([])
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(1)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(flow.updates).toHaveLength(1)
  await userEvent.click(
    page.getByRole('button', { name: 'Previous', exact: true })
  )
  await expect.element(toggle(1)).toHaveAttribute('aria-expanded', 'false')
  expect(details()).toEqual([])
})
