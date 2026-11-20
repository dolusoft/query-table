import axe from 'axe-core'
import { afterEach, describe, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'

import '../../../apps/playground/playground.css'
import DataTableVariations from '../../../apps/playground/examples/DataTableVariations.vue'
import { setTheme } from '../../../apps/playground/harness/theme'
import {
  axes,
  type AxisId
} from '../../../apps/playground/scenarios/variations'

// The variation matrix of #204 on the DataTable variations page: every
// variation draws on `DataTable`, and the same props on `QueryTable` fed by
// `useLocalQuery` draw the same table (C-127). The page draws the table again
// from scratch on every change of a select.

afterEach(() => {
  cleanup()
  setTheme(null)
})

/** The page's table root, not a table nested in a `subtable` slot. */
const root = () => {
  const element = document.querySelector<HTMLElement>(
    '.variation-box > .qt-datatable'
  )
  expect(element).not.toBeNull()
  return element!
}
/** Elements of the page's own table, none of a nested one. */
const own = <E extends Element = HTMLElement>(selector: string) =>
  [...root().querySelectorAll<E>(selector)].filter(
    element => element.closest('.qt-datatable') === root()
  )
const dataRows = () => own<HTMLTableRowElement>('tbody > tr[data-row-index]')
const idOf = (row: Element) =>
  Number(row.querySelector('td[data-field="id"]')?.textContent?.trim())
const ids = () => dataRows().map(idOf)

const choose = async (axis: AxisId | 'engine', value: string) => {
  const select = document.querySelector<HTMLSelectElement>(`#variation-${axis}`)
  expect(select).not.toBeNull()
  await userEvent.selectOptions(select!, value)
  await expect.poll(() => select!.value).toBe(value)
}

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
/** The table's markup once it stops changing (a measure, a virtual window). */
const settled = async () => {
  let last = ''
  let same = 0
  for (let tries = 0; tries < 60 && same < 3; tries++) {
    await frame()
    const html = markup()
    same = html === last ? same + 1 : 0
    last = html
  }
  return last
}

const show = async (choice: Partial<Record<AxisId, string>>) => {
  await render(DataTableVariations)
  for (const [axis, value] of Object.entries(choice)) {
    await choose(axis as AxisId, value)
  }
  await expect.poll(() => root().isConnected).toBe(true)
}

/**
 * The table's markup without the ids Vue's `useId` gives the slot content
 * (`v-0`, `v-11-2`): the filter menu's popover counts up with every mount.
 */
const markup = () => root().outerHTML.replace(/\bv-\d+(-\d+)*\b/g, 'v-#')

/** Where two markups part, with some context, or null when they are equal. */
const difference = (received: string, expected: string) => {
  if (received === expected) {
    return null
  }
  let at = 0
  while (received[at] === expected[at]) {
    at++
  }
  const from = Math.max(0, at - 160)
  return {
    received: received.slice(from, at + 160),
    expected: expected.slice(from, at + 160)
  }
}

const everyVariation = (Object.keys(axes) as AxisId[]).flatMap(axis =>
  Object.keys(axes[axis].variations).map(value => [axis, value] as const)
)

describe('C-127 DataTable variations: QueryTable with useLocalQuery draws the same table (#204)', () => {
  test.each(everyVariation)('%s: %s', async (axis, value) => {
    await show({ [axis]: value })
    const fromDataTable = await settled()
    await choose('engine', 'query-table')
    await settled()
    await expect.poll(() => difference(markup(), fromDataTable)).toBeNull()
  })
})

describe('C-124 DataTable variations: paging (#204)', () => {
  test('pages: the first page of five rows, then the next', async () => {
    await show({ paging: 'pages' })
    await expect.poll(ids).toEqual([1, 2, 3, 4, 5])
    expect(own('.qt-pagination')).toHaveLength(1)
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.poll(ids).toEqual([6, 7, 8, 9, 10])
  })

  test('every row: all of them and no pagination block', async () => {
    await show({ paging: 'all' })
    await expect.poll(() => dataRows().length).toBe(200)
    expect(own('.qt-pagination')).toHaveLength(0)
  })

  test('virtual body: only the rows in view, the last one after a scroll', async () => {
    await show({ paging: 'virtual' })
    await expect.poll(() => dataRows().length).toBeGreaterThan(0)
    expect(dataRows().length).toBeLessThan(200)
    expect(own('tr.qt-virtual-spacer').length).toBeGreaterThan(0)
    const box = document.querySelector<HTMLElement>('.variation-box')!
    box.scrollTop = box.scrollHeight
    await expect.poll(() => ids().includes(200)).toBe(true)
  })
})

describe('C-124 DataTable variations: expanding rows (#204)', () => {
  const expand = (index: number) =>
    dataRows()[index].querySelector<HTMLButtonElement>('.qt-expand')!
  const openRows = () => own('tbody > tr.qt-subtable-row').length

  test('none: no expand button', async () => {
    await show({ expand: 'none' })
    await expect.poll(() => dataRows().length).toBe(5)
    expect(own('.qt-expand')).toHaveLength(0)
  })

  test('several open: two rows stay open', async () => {
    await show({ expand: 'multiple' })
    await userEvent.click(expand(0))
    await userEvent.click(expand(1))
    await expect.poll(openRows).toBe(2)
  })

  test('one open: opening a row closes the other', async () => {
    await show({ expand: 'single' })
    await userEvent.click(expand(0))
    await userEvent.click(expand(1))
    await expect.poll(openRows).toBe(1)
    expect(dataRows()[1].hasAttribute('data-expanded')).toBe(true)
    expect(dataRows()[0].hasAttribute('data-expanded')).toBe(false)
  })

  test('some rows: only the odd rows have a button (C-98)', async () => {
    await show({ expand: 'some' })
    await expect.poll(() => dataRows().length).toBe(5)
    const withButton = dataRows()
      .filter(row => row.querySelector('.qt-expand'))
      .map(idOf)
    expect(withButton).toEqual([1, 3, 5])
  })

  test('open at the start: the first row is open on mount', async () => {
    await show({ expand: 'open' })
    await expect.poll(openRows).toBe(1)
    expect(dataRows()[0].hasAttribute('data-expanded')).toBe(true)
  })

  test('a table inside: the open row draws a nested table', async () => {
    await show({ expand: 'nested' })
    await userEvent.click(expand(0))
    await expect
      .poll(() => root().querySelectorAll('.qt-subtable-row .qt-table').length)
      .toBe(1)
  })

  test('loaded when opened: a placeholder, then the content', async () => {
    await show({ expand: 'lazy' })
    await userEvent.click(expand(0))
    const detail = () => own('tbody > tr.qt-subtable-row')[0]
    await expect.poll(() => detail()?.textContent).toContain('Loading details')
    await expect
      .poll(() => detail()?.querySelectorAll('li').length ?? 0)
      .toBeGreaterThan(0)
  })
})

describe('C-124 DataTable variations: selection (#204)', () => {
  const count = () =>
    document.querySelector('[data-testid="selected-count"]')?.textContent

  test('none: no checkbox', async () => {
    await show({ selection: 'none' })
    await expect.poll(() => dataRows().length).toBe(5)
    expect(own('.qt-select-row')).toHaveLength(0)
  })

  test('several rows: the page counts them and clears them', async () => {
    await show({ selection: 'many' })
    const boxes = () => own<HTMLInputElement>('.qt-select-row')
    await expect.poll(() => boxes().length).toBe(5)
    await userEvent.click(boxes()[0])
    await userEvent.click(boxes()[2])
    await expect.poll(count).toBe('2 selected')
    expect(
      dataRows()
        .filter(row => row.hasAttribute('data-selected'))
        .map(idOf)
    ).toEqual([1, 3])
    await page.getByRole('button', { name: 'Clear selection' }).click()
    await expect.poll(count).toBe('0 selected')
  })
})

describe('C-124 DataTable variations: sort, filter, search (#204)', () => {
  const sortButton = (field: string) =>
    own(`th[data-field="${field}"] .qt-sort`)[0]
  const filterInput = (field: string) =>
    own<HTMLInputElement>(`th[data-field="${field}"] .qt-filter-input`)[0]

  test('sort and filter row: a sort and a filter narrow the rows', async () => {
    await show({ query: 'filters' })
    await userEvent.click(sortButton('id'))
    await userEvent.click(sortButton('id'))
    await expect.poll(() => ids()[0]).toBe(200)
    await userEvent.fill(filterInput('id'), '7')
    await userEvent.keyboard('{Enter}')
    await expect.poll(ids).toEqual([7])
  })

  test('sort only: sort buttons and no filter row', async () => {
    await show({ query: 'sort' })
    await expect.poll(() => own('.qt-sort').length).toBeGreaterThan(0)
    expect(own('.qt-filter-input')).toHaveLength(0)
  })

  test('some columns: the opted-out column offers no sort and no filter', async () => {
    await show({ query: 'some' })
    await expect.poll(() => dataRows().length).toBe(5)
    const headers = own<HTMLTableCellElement>('thead th[data-field]')
    const bare = headers.filter(
      th =>
        !th.querySelector('.qt-sort') && !th.querySelector('.qt-filter-input')
    )
    expect(bare).toHaveLength(1)
    expect(sortButton('id')).toBeDefined()
    expect(filterInput('id')).toBeDefined()
  })

  test('global search: the toolbar input narrows the rows', async () => {
    await show({ query: 'search' })
    await expect.poll(() => dataRows().length).toBe(5)
    const before = dataRows()[0]
    const text = before
      .querySelectorAll('td[data-field]')[1]
      .textContent!.trim()
    await userEvent.fill(page.getByRole('searchbox', { name: 'Search' }), text)
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => dataRows().length).toBeGreaterThan(0)
    await expect
      .poll(() =>
        dataRows().every(row =>
          row
            .textContent!.toLocaleLowerCase('tr')
            .includes(text.toLocaleLowerCase('tr'))
        )
      )
      .toBe(true)
  })

  test('none: no sort button and no filter row', async () => {
    await show({ query: 'none' })
    await expect.poll(() => dataRows().length).toBe(5)
    expect(own('.qt-sort')).toHaveLength(0)
    expect(own('.qt-filter-input')).toHaveLength(0)
  })
})

describe('C-124 DataTable variations: columns (#204)', () => {
  const header = (field: string) =>
    own<HTMLTableCellElement>(`thead th[data-field="${field}"]`)[0]

  test('automatic width: every header cell gets a width', async () => {
    await show({ columns: 'auto' })
    await expect
      .poll(() =>
        own<HTMLElement>('thead th[data-field]').every(
          th => th.style.width !== ''
        )
      )
      .toBe(true)
  })

  test('fixed width: the width of the column', async () => {
    await show({ columns: 'fixed' })
    await expect.poll(() => header('id')?.style.width).toBe('5rem')
  })

  test('resizable: a key on the handle makes the column wider', async () => {
    await show({ columns: 'resize' })
    const handle = () =>
      header('id').querySelector<HTMLElement>('.qt-resize-handle')!
    await expect.poll(() => handle()).toBeTruthy()
    const before = header('id').getBoundingClientRect().width
    handle().focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect
      .poll(() => header('id').getBoundingClientRect().width)
      .toBeGreaterThan(before)
  })

  test('actions pinned right: the column is pinned and its button acts', async () => {
    await show({ columns: 'pinned' })
    await expect.poll(() => header('actions')?.dataset.pinned).toBe('right')
    expect(
      dataRows().every(
        row =>
          row
            .querySelector('td[data-field="actions"]')
            ?.getAttribute('data-pinned') === 'right'
      )
    ).toBe(true)
    await userEvent.click(
      dataRows()[0].querySelector('td[data-field="actions"] button')!
    )
    await expect
      .poll(
        () => document.querySelector('[data-testid="opened-row"]')?.textContent
      )
      .toBe('Opened row 1')
  })

  test('scrolls sideways: the table is wider than its box', async () => {
    await show({ columns: 'narrow' })
    const box = () => root().querySelector<HTMLElement>('.qt-table-responsive')!
    await expect.poll(() => box().scrollWidth > box().clientWidth).toBe(true)
  })
})

describe('C-124 DataTable variations: rows (#204)', () => {
  test('plain: no link, no group, no pin', async () => {
    await show({ rows: 'plain' })
    await expect.poll(() => dataRows().length).toBe(5)
    expect(own('tbody a')).toHaveLength(0)
    expect(own('.qt-group-row')).toHaveLength(0)
  })

  test('clickable: the link of a row opens it', async () => {
    await show({ rows: 'link' })
    await expect.poll(() => own('tbody a').length).toBe(5)
    await userEvent.click(own('tbody a')[1])
    await expect
      .poll(
        () => document.querySelector('[data-testid="opened-row"]')?.textContent
      )
      .toBe('Opened row 2')
  })

  test('keyboard: ArrowDown moves the focus to the next row (C-109)', async () => {
    await show({ rows: 'keyboard' })
    await expect.poll(() => own('tbody a').length).toBe(5)
    own<HTMLAnchorElement>('tbody a')[0].focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect
      .poll(() =>
        document.activeElement?.closest('tr')?.getAttribute('data-row-index')
      )
      .toBe('1')
  })

  test('grouped: a group row above each run of a category (C-103)', async () => {
    await show({ rows: 'grouped' })
    await expect.poll(() => own('.qt-group-row').length).toBeGreaterThan(0)
    const first = own('.qt-group-row')[0]
    expect(first.textContent).toMatch(/·\s*\d+/)
  })

  test('pinned: a pinned row is drawn first (C-74)', async () => {
    await show({ rows: 'pinned' })
    await expect.poll(() => dataRows().length).toBe(5)
    await userEvent.click(dataRows()[2].querySelector('button')!)
    await expect.poll(() => idOf(dataRows()[0])).toBe(3)
    expect(dataRows()[0].getAttribute('data-pinned-row')).toBe('top')
  })
})

describe('C-124 DataTable variations: header (#204)', () => {
  test('shown: the header row', async () => {
    await show({ header: 'shown' })
    await expect.poll(() => own('thead').length).toBe(1)
  })

  test('none: no thead, the rows stay (C-121)', async () => {
    await show({ header: 'none' })
    await expect.poll(() => dataRows().length).toBe(5)
    expect(own('thead')).toHaveLength(0)
  })

  test('scrolling body: three tables under one wrapper (C-101)', async () => {
    await show({ header: 'scroll' })
    await expect.poll(() => own('.qt-table-head').length).toBe(1)
    expect(own('.qt-table-body')).toHaveLength(1)
  })
})

describe('C-124 DataTable variations: state (#204)', () => {
  test('rows: the first page', async () => {
    await show({ state: 'rows' })
    await expect.poll(() => dataRows().length).toBe(5)
  })

  test('loading: the root is busy and the loading row draws the skeleton', async () => {
    await show({ state: 'loading' })
    await expect.poll(() => root().getAttribute('aria-busy')).toBe('true')
    expect(own('tbody > tr.qt-loading-row')).toHaveLength(1)
  })

  test('empty: the empty slot', async () => {
    await show({ state: 'empty' })
    await expect
      .poll(() => own('tbody > tr.qt-empty-row')[0]?.textContent?.trim())
      .toBe('No rows to show.')
  })

  test('query error: the error slot in the empty row', async () => {
    await show({ state: 'error' })
    await expect
      .poll(() => own('tbody > tr.qt-empty-row [role="alert"]')[0]?.textContent)
      .toBe('Query error: invalid-page (/page).')
    expect(dataRows()).toHaveLength(0)
  })
})

describe('C-124 DataTable variations: texts and accessibility (#204)', () => {
  test('Turkish: the labels name the controls', async () => {
    await show({ text: 'turkish' })
    await expect
      .poll(() =>
        own('thead th[data-field="id"] .qt-filter-input')[0]?.getAttribute(
          'aria-label'
        )
      )
      .toBe('ID filtresi')
  })

  test.each(['light', 'dark'] as const)(
    'C-45 an axe scan finds nothing, %s theme',
    async theme => {
      setTheme(theme)
      await show({
        expand: 'multiple',
        selection: 'many',
        columns: 'pinned',
        text: 'turkish'
      })
      await userEvent.click(
        dataRows()[0].querySelector<HTMLElement>('.qt-expand')!
      )
      await settled()
      const result = await axe.run(root(), { resultTypes: ['violations'] })
      expect(
        result.violations.map(
          violation =>
            `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`
        )
      ).toEqual([])
    }
  )
})
