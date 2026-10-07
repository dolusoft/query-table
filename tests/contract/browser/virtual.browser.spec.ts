import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi
} from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { defineComponent, h, ref } from 'vue'

import {
  drawnIndexes,
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  spacers,
  useFixedLayout,
  type HostApi
} from '../../support/scroll-host'

// C-83 to C-87: the virtual body in a real browser, with the test skin.
// 3.2 additions: not in a 3.1 baseline (`ADDED_AFTER_BASELINE`).

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(() => {
  cleanup()
  window.scrollTo(0, 0)
  vi.restoreAllMocks()
})

const mount = async (
  options: {
    count?: number
    tableProps?: Record<string, unknown>
    height?: number
    slots?: Record<string, unknown>
    totalRows?: number | null
  } = {}
) => {
  let api: HostApi | null = null
  await render(ScrollHost as never, {
    props: {
      rows: scrollRows(options.count ?? 1000),
      tableProps: { virtual: true, ...options.tableProps },
      height: options.height ?? 300,
      totalRows: options.totalRows ?? null,
      slots: options.slots ?? {},
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(4)
  return api!
}

const rowTop = (index: number) =>
  document
    .querySelector(`.qt-table tbody > tr[data-row-index="${index}"]`)!
    .getBoundingClientRect().top

/** The data row at the top edge of the box, under the header. */
const firstVisible = (box: HTMLElement) => {
  const top = box.getBoundingClientRect().top
  const head = document
    .querySelector('.qt-table thead')!
    .getBoundingClientRect()
  const edge = Math.max(top, head.bottom > top ? head.bottom : top)
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.qt-table tbody > tr[data-row-index]'
    )
  ].find(tr => tr.getBoundingClientRect().bottom > edge + 1)!
}

describe('C-83 Virtual rows [own]', () => {
  test('draws the rows in view and overscan more, between spacers', async () => {
    const api = await mount({ tableProps: { virtual: { overscan: 5 } } })
    const drawn = drawnIndexes()
    expect(drawn[0]).toBe(0)
    expect(drawn.length).toBeGreaterThan(5)
    expect(drawn.length).toBeLessThan(40)
    // At the top: no upper spacer, one lower spacer.
    const [below] = spacers()
    expect(spacers()).toHaveLength(1)
    expect(below.getAttribute('aria-hidden')).toBe('true')
    expect(below.children).toHaveLength(1)
    expect(below.children[0].getAttribute('colspan')).toBe('3')
    expect(below.style.height).toMatch(/^\d+(\.\d+)?px$/)
    expect(api.events).toEqual([])

    await scrollTo(api.box(), 15000)
    const middle = drawnIndexes()
    expect(middle[0]).toBeGreaterThan(100)
    // The drawn rows keep their index in `rows` and come in order.
    expect(middle).toEqual(
      Array.from({ length: middle.length }, (_, i) => middle[0] + i)
    )
    expect(spacers()).toHaveLength(2)
    expect(api.events).toEqual([])
  })

  test('keeps the full height: the spacers stand for the rows left out', async () => {
    const api = await mount({ tableProps: { virtual: { rowHeight: 40 } } })
    // The spacers and the drawn rows (counted at 40) make up every row.
    const counted = () =>
      spacers().reduce(
        (sum, spacer) => sum + parseFloat(spacer.style.height),
        0
      ) +
      drawnIndexes().length * 40
    expect(counted()).toBe(1000 * 40)
    await scrollTo(api.box(), 20000)
    expect(spacers()).toHaveLength(2)
    expect(counted()).toBe(1000 * 40)
  })

  test('always draws pinned rows, before the upper and after the lower spacer', async () => {
    const api = await mount({
      tableProps: { rowPinning: { top: ['1'], bottom: ['1000'] } }
    })
    await scrollTo(api.box(), 15000)
    const children = [...document.querySelector('.qt-table tbody')!.children]
    expect(children[0].getAttribute('data-pinned-row')).toBe('top')
    expect(children[1].classList.contains('qt-virtual-spacer')).toBe(true)
    expect(children.at(-1)!.getAttribute('data-pinned-row')).toBe('bottom')
    expect(children.at(-2)!.classList.contains('qt-virtual-spacer')).toBe(true)
  })

  test('passes the index in rows to the cell slot', async () => {
    const api = await mount({
      slots: {
        'cell-name': (p: { rowIndex: number }) =>
          h('span', { class: 'at' }, String(p.rowIndex))
      }
    })
    await scrollTo(api.box(), 15000)
    const tr = document.querySelector<HTMLElement>(
      '.qt-table tbody > tr[data-row-index]'
    )!
    expect(tr.querySelector('.at')!.textContent).toBe(tr.dataset.rowIndex)
  })
})

describe('C-84 Row heights [own]', () => {
  test('with rowHeight the spacer is the count of rows left out times that height', async () => {
    const api = await mount({
      tableProps: { virtual: { rowHeight: 40, overscan: 0 } }
    })
    await scrollTo(api.box(), 4000)
    const drawn = drawnIndexes()
    const [above, below] = spacers()
    expect(parseFloat(above.style.height)).toBe(drawn[0] * 40)
    expect(parseFloat(below.style.height)).toBe((1000 - drawn.at(-1)! - 1) * 40)
  })

  test('keeps the rows in view where they were when measured heights differ from the estimate', async () => {
    // Every tenth row is tall; the estimate is far too small.
    const api = await mount({
      tableProps: { virtual: { estimateRowHeight: 10, overscan: 2 } },
      slots: {
        'cell-name': (p: { rowIndex: number; row: { name: string } }) =>
          h(
            'div',
            { style: p.rowIndex % 10 === 0 ? 'height: 120px' : '' },
            p.row.name
          )
      }
    })
    const box = api.box()
    await scrollTo(box, 3000)
    const first = firstVisible(box)
    const index = first.dataset.rowIndex
    const top = first.getBoundingClientRect().top
    // Scroll up a little: rows above come in with their real heights.
    await scrollTo(box, box.scrollTop - 50)
    await frames(4)
    const after = document.querySelector<HTMLElement>(
      `.qt-table tbody > tr[data-row-index="${index}"]`
    )!
    expect(after.getBoundingClientRect().top).toBeCloseTo(top + 50, -1)
  })
})

describe('C-85 Scroll element [own]', () => {
  test('uses virtual.scrollElement when it returns an element', async () => {
    let outer: HTMLElement | null = null
    const api = await mount({
      height: 300,
      tableProps: { virtual: { scrollElement: () => outer } }
    })
    outer = api.box()
    // The table finds the same box by itself; the given one wins either way.
    await scrollTo(api.box(), 10000)
    expect(drawnIndexes()[0]).toBeGreaterThan(100)
    expect(api.box().getAttribute('tabindex')).toBeNull()
    expect(api.box().getAttribute('style')).toBe(
      'height: 300px; overflow-y: auto;'
    )
  })

  test('falls back to the window without a scrolling ancestor', async () => {
    const api = await mount({
      height: 0,
      tableProps: { virtual: { rowHeight: 40 } }
    })
    expect(drawnIndexes().length).toBeLessThan(80)
    await scrollTo(null, 20000)
    expect(drawnIndexes()[0]).toBeGreaterThan(300)
    expect(api.events).toEqual([])
  })

  test('corrects the drift and lands scrollToIndex under scroll-behavior: smooth', async () => {
    const style = document.createElement('style')
    style.textContent = '.scroll-box { scroll-behavior: smooth; }'
    document.head.append(style)
    try {
      const api = await mount({
        tableProps: { virtual: { estimateRowHeight: 10, overscan: 2 } },
        slots: {
          'cell-name': (p: { rowIndex: number; row: { name: string } }) =>
            h(
              'div',
              { style: p.rowIndex % 10 === 0 ? 'height: 120px' : '' },
              p.row.name
            )
        }
      })
      const box = api.box()
      // The user's own scrolling: instant, as a wheel or a drag would be.
      const userScroll = async (top: number) => {
        box.style.scrollBehavior = 'auto'
        await scrollTo(box, top)
        box.style.scrollBehavior = ''
      }
      await userScroll(3000)
      await frames(4)
      const first = firstVisible(box)
      const index = first.dataset.rowIndex
      const top = first.getBoundingClientRect().top
      await userScroll(box.scrollTop - 40)
      await frames(8)
      const after = document.querySelector<HTMLElement>(
        `.qt-table tbody > tr[data-row-index="${index}"]`
      )!
      expect(after.getBoundingClientRect().top).toBeCloseTo(top + 40, -1)

      api.table().scrollToIndex(700, { align: 'start' })
      await frames(8)
      const tr = document.querySelector(
        '.qt-table tbody > tr[data-row-index="700"]'
      )!
      expect(tr).not.toBeNull()
      const head = document
        .querySelector('.qt-table thead')!
        .getBoundingClientRect()
      const view = box.getBoundingClientRect()
      const viewTop =
        head.bottom > view.top && head.top <= view.top + 1
          ? head.bottom
          : view.top
      expect(tr.getBoundingClientRect().top).toBeCloseTo(viewTop, -1)
    } finally {
      style.remove()
    }
  })

  test('follows its scroll box when mounted hidden and shown later', async () => {
    let api: HostApi | null = null
    const shown = ref(false)
    const Wrap = defineComponent({
      setup: () => () =>
        h('div', { style: shown.value ? '' : 'display: none' }, [
          h(
            ScrollHost as never,
            {
              rows: scrollRows(1000),
              tableProps: { virtual: true },
              height: 300,
              api: (given: HostApi) => {
                api = given
              }
            } as never
          )
        ])
    })
    await render(Wrap)
    await frames(4)
    shown.value = true
    await frames(6)
    await scrollTo(api!.box(), 15000)
    await frames(4)
    expect(drawnIndexes()[0]).toBeGreaterThan(300)
    expect(drawnIndexes().length).toBeLessThan(80)
  })

  test('warns once in development with the automatic table layout', async () => {
    restoreLayout()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const api = await mount()
    await scrollTo(api.box(), 5000)
    restoreLayout = useFixedLayout()
    expect(
      warn.mock.calls.filter(call => String(call[0]).includes('table-layout'))
    ).toHaveLength(1)
  })
})

describe('C-86 Virtual accessibility [own]', () => {
  test('counts every row and numbers the drawn ones', async () => {
    const api = await mount({
      count: 200,
      tableProps: {
        footerRows: [{ cells: [{ field: 'age', text: 'Total' }] }]
      }
    })
    const table = document.querySelector('.qt-table')!
    // Header 1 + 200 rows + 1 footer row.
    expect(table.getAttribute('aria-rowcount')).toBe('202')
    expect(
      document
        .querySelector('.qt-table thead > tr')!
        .getAttribute('aria-rowindex')
    ).toBe('1')
    await scrollTo(api.box(), 3000)
    for (const tr of document.querySelectorAll<HTMLElement>(
      '.qt-table tbody > tr[data-row-index]'
    )) {
      expect(tr.getAttribute('aria-rowindex')).toBe(
        String(Number(tr.dataset.rowIndex) + 2)
      )
    }
    expect(
      document
        .querySelector('.qt-table tfoot > tr')!
        .getAttribute('aria-rowindex')
    ).toBe('202')
  })

  test('counts open subtable rows and numbers them after their row', async () => {
    await mount({
      count: 50,
      tableProps: { hasSubtable: true },
      slots: { subtable: () => h('span', 'details') }
    })
    const expand = document.querySelectorAll<HTMLButtonElement>('.qt-expand')
    expand[1].click()
    await frames(3)
    const table = document.querySelector('.qt-table')!
    expect(table.getAttribute('aria-rowcount')).toBe('52')
    expect(
      document.querySelector('.qt-subtable-row')!.getAttribute('aria-rowindex')
    ).toBe('4')
    expect(
      document
        .querySelector('.qt-table tbody > tr[data-row-index="2"]')!
        .getAttribute('aria-rowindex')
    ).toBe('5')
  })

  test('counts -1 while an infinite list of unknown total has more to load', async () => {
    await mount({ count: 50, tableProps: { infinite: true } })
    expect(
      document.querySelector('.qt-table')!.getAttribute('aria-rowcount')
    ).toBe('-1')
  })

  test('counts the known total while an infinite list has more to load, and leaves the footer unnumbered', async () => {
    await mount({
      count: 50,
      totalRows: 5000,
      tableProps: {
        infinite: true,
        footerRows: [{ cells: [{ field: 'age', text: 'Total' }] }]
      }
    })
    // Header 1 + 5000 rows + 1 footer row.
    expect(
      document.querySelector('.qt-table')!.getAttribute('aria-rowcount')
    ).toBe('5002')
    const footer = document.querySelector('.qt-table tfoot > tr')!
    expect(footer.hasAttribute('aria-rowindex')).toBe(false)
  })

  test('keeps the focused row drawn after it leaves the window', async () => {
    const api = await mount({
      tableProps: { virtual: { overscan: 2 } },
      slots: {
        'cell-name': (p: { row: { name: string } }) =>
          h('button', { class: 'cell-button' }, p.row.name)
      }
    })
    const button = document.querySelector<HTMLButtonElement>(
      '.qt-table tbody > tr[data-row-index="3"] .cell-button'
    )!
    button.focus()
    await scrollTo(api.box(), 15000)
    expect(drawnIndexes()).toContain(3)
    expect(document.activeElement).toBe(button)
    // Its own spacers: one before (0 to 2) and one between it and the window.
    const body = [...document.querySelector('.qt-table tbody')!.children]
    expect(body[0].classList.contains('qt-virtual-spacer')).toBe(true)
    expect(body[1].getAttribute('data-row-index')).toBe('3')
    expect(body[2].classList.contains('qt-virtual-spacer')).toBe(true)
    button.blur()
    await frames(3)
    expect(drawnIndexes()).not.toContain(3)
  })

  test('writes neither attribute without virtual', async () => {
    await mount({ count: 30, tableProps: { virtual: false } })
    expect(
      document.querySelector(
        '[aria-rowcount], [aria-rowindex], .qt-virtual-spacer'
      )
    ).toBeNull()
  })
})

describe('C-87 Print and scrollToIndex [own]', () => {
  test('draws every row while the page prints', async () => {
    await mount({ count: 300 })
    expect(drawnIndexes().length).toBeLessThan(300)
    window.dispatchEvent(new Event('beforeprint'))
    await frames(2)
    expect(drawnIndexes()).toHaveLength(300)
    expect(spacers()).toHaveLength(0)
    window.dispatchEvent(new Event('afterprint'))
    await frames(4)
    expect(drawnIndexes().length).toBeLessThan(300)
  })

  test.each(['start', 'center', 'end', 'auto'] as const)(
    'scrolls a row far away into view with align %s',
    async align => {
      const api = await mount({
        slots: {
          'cell-name': (p: { rowIndex: number; row: { name: string } }) =>
            h(
              'div',
              { style: p.rowIndex % 7 === 0 ? 'height: 90px' : '' },
              p.row.name
            )
        }
      })
      const box = api.box()
      api.table().scrollToIndex(700, { align })
      await frames(6)
      const tr = document.querySelector(
        `.qt-table tbody > tr[data-row-index="700"]`
      )!
      expect(tr).not.toBeNull()
      const rect = tr.getBoundingClientRect()
      const view = box.getBoundingClientRect()
      const head = document
        .querySelector('.qt-table thead')!
        .getBoundingClientRect()
      const viewTop =
        head.bottom > view.top && head.top <= view.top + 1
          ? head.bottom
          : view.top
      expect(rect.top).toBeGreaterThanOrEqual(view.top - 1)
      expect(rect.bottom).toBeLessThanOrEqual(view.bottom + 1)
      if (align === 'start') {
        expect(rect.top).toBeCloseTo(viewTop, -1)
      }
      if (align === 'end') {
        expect(rect.bottom).toBeCloseTo(view.top + box.clientHeight, -1)
      }
      if (align === 'center') {
        expect((rect.top + rect.bottom) / 2).toBeCloseTo(
          (viewTop + view.top + box.clientHeight) / 2,
          -1
        )
      }
      expect(api.events).toEqual([])
    }
  )

  test('draws every row while the print media query matches', async () => {
    let onChange: ((event: { matches: boolean }) => void) | null = null
    const real = window.matchMedia.bind(window)
    vi.spyOn(window, 'matchMedia').mockImplementation(query =>
      query === 'print'
        ? ({
            matches: false,
            media: query,
            addEventListener: (_: string, handler: never) => {
              onChange = handler
            },
            removeEventListener: () => undefined
          } as unknown as MediaQueryList)
        : real(query)
    )
    await mount({ count: 300 })
    expect(onChange).not.toBeNull()
    onChange!({ matches: true })
    await frames(2)
    expect(drawnIndexes()).toHaveLength(300)
    expect(spacers()).toHaveLength(0)
    onChange!({ matches: false })
    await frames(4)
    expect(drawnIndexes().length).toBeLessThan(300)
  })

  test('calls scrollIntoView on a pinned row', async () => {
    const api = await mount({
      tableProps: { rowPinning: { top: [], bottom: ['500'] } }
    })
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    // Row id 500 is index 499.
    api.table().scrollToIndex(499, { align: 'center' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.contexts[0]).toBe(
      document.querySelector('.qt-table tbody > tr[data-pinned-row="bottom"]')
    )
    expect(spy.mock.calls[0][0]).toMatchObject({ block: 'center' })
  })

  test('drops a waiting scrollToIndex when rows change, and jumps nowhere later', async () => {
    const api = await mount({
      tableProps: { virtual: { rowHeight: 40, overscan: 2 } }
    })
    const box = api.box()
    api.table().scrollToIndex(700, { align: 'start' })
    api.setRows(scrollRows(50))
    await frames(6)
    api.setRows(scrollRows(1000))
    await frames(6)
    await scrollTo(box, 695 * 40)
    await frames(6)
    expect(box.scrollTop).toBeCloseTo(695 * 40, -1)
  })

  test('does nothing for an index outside rows, and scrolls into view without virtual', async () => {
    const api = await mount({ count: 200, tableProps: { virtual: false } })
    api.table().scrollToIndex(5000)
    api.table().scrollToIndex(-1)
    expect(api.box().scrollTop).toBe(0)
    api.table().scrollToIndex(150, { align: 'start' })
    await frames(2)
    expect(rowTop(150)).toBeCloseTo(api.box().getBoundingClientRect().top, -1)
  })
})
