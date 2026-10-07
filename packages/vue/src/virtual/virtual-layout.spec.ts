import { mount, type VueWrapper } from '@vue/test-utils'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance
} from 'vitest'
import { h, nextTick, type Component } from 'vue'

import type { Column, TableQuery } from '../contract'
import QueryTable from '../query-table.vue'

// Mounted with loose props: each test passes only the ones it needs.
const Table = QueryTable as unknown as Component

// C-83 to C-90 in happy-dom with a fake layout: happy-dom lays nothing out,
// so every box below comes from `rectOf`, which stacks the rows of each
// table section by fixed heights the way a browser with `table-layout:
// fixed` would. The browser specs in tests/contract/browser check the same
// rules against a real layout; these keep the code paths covered by the
// unit run (`pnpm test:coverage`).

interface Geometry {
  /** The scroll box, or `null` for a table that scrolls with the window. */
  box: HTMLElement | null
  view: number
  head: number
  row: number
  /** Heights of single rows by `data-row-index`. */
  heights: Map<number, number>
  /** The header sticks to the top of the box. */
  sticky: boolean
  /** Everything has no size (`display: none`). */
  hidden: boolean
  /**
   * A move of the scroll position the browser makes on its own (scroll
   * anchoring), applied at the next layout: the next read of `scrollTop`.
   */
  anchorShift: number
}

const geo: Geometry = {
  box: null,
  view: 300,
  head: 40,
  row: 30,
  heights: new Map(),
  sticky: false,
  hidden: false,
  anchorShift: 0
}

const rowHeight = (tr: Element): number => {
  if (geo.hidden) {
    return 0
  }
  if (tr.parentElement?.tagName === 'THEAD') {
    return geo.head
  }
  if (tr.classList.contains('qt-virtual-spacer')) {
    return parseFloat((tr as HTMLElement).style.height) || 0
  }
  if (tr.classList.contains('qt-subtable-row')) {
    return 50
  }
  const at = tr.getAttribute('data-row-index')
  return at === null ? geo.row : (geo.heights.get(Number(at)) ?? geo.row)
}

const sectionHeight = (section: Element | null | undefined) =>
  section
    ? [...section.children].reduce((sum, tr) => sum + rowHeight(tr), 0)
    : 0

const scrollPosition = () => (geo.box ? geo.box.scrollTop : window.scrollY)

const rect = (top: number, height: number) =>
  ({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 600,
    width: 600,
    x: 0,
    y: top,
    toJSON: () => ({})
  }) as DOMRect

function rectOf(this: Element): DOMRect {
  if (this === geo.box) {
    return rect(0, geo.hidden ? 0 : geo.view)
  }
  const table = this.closest('table')
  if (!table) {
    return rect(0, 0)
  }
  const top = -scrollPosition()
  const head = sectionHeight(table.tHead)
  const body = sectionHeight(table.tBodies[0])
  const foot = sectionHeight(table.tFoot)
  const sectionTop = (section: Element) =>
    section.tagName === 'THEAD'
      ? geo.sticky
        ? 0
        : top
      : section.tagName === 'TBODY'
        ? top + head
        : top + head + body
  switch (this.tagName) {
    case 'TABLE':
      return rect(top, head + body + foot)
    case 'THEAD':
    case 'TBODY':
    case 'TFOOT':
      return rect(sectionTop(this), sectionHeight(this))
    case 'TR': {
      const section = this.parentElement!
      let at = sectionTop(section)
      for (const tr of section.children) {
        if (tr === this) {
          break
        }
        at += rowHeight(tr)
      }
      return rect(at, rowHeight(this))
    }
    default:
      return rect(0, 0)
  }
}

/** A scroll box whose content height follows the fake layout. */
const makeBox = () => {
  const box = document.createElement('div')
  box.style.overflowY = 'auto'
  let top = 0
  const max = () => {
    const table = box.querySelector('table')
    // Summed here, not through `rectOf`, which reads `scrollTop`.
    const total = table
      ? sectionHeight(table.tHead) +
        sectionHeight(table.tBodies[0]) +
        sectionHeight(table.tFoot)
      : 0
    return Math.max(0, total - geo.view)
  }
  Object.defineProperties(box, {
    scrollTop: {
      get: () => {
        // Applied once the drawn rows changed: the first one is another.
        if (
          geo.anchorShift &&
          box
            .querySelector('tbody > tr[data-row-index]')
            ?.getAttribute('data-row-index') !== '0'
        ) {
          top = Math.min(Math.max(0, top + geo.anchorShift), max())
          geo.anchorShift = 0
        }
        return top
      },
      set: (value: number) => {
        top = Math.min(Math.max(0, value), max())
      }
    },
    scrollHeight: {
      get: () => (geo.hidden ? 0 : max() + geo.view)
    },
    clientHeight: { get: () => (geo.hidden ? 0 : geo.view) }
  })
  box.scrollTo = ((options: ScrollToOptions) => {
    box.scrollTop = options.top ?? top
  }) as typeof box.scrollTo
  document.body.append(box)
  return box
}

// ResizeObserver and IntersectionObserver: recorded, fired by hand.
const resizeObservers = new Set<FakeResizeObserver>()
class FakeResizeObserver {
  constructor(public callback: () => void) {
    resizeObservers.add(this)
  }
  observe() {}
  unobserve() {}
  disconnect() {
    resizeObservers.delete(this)
  }
}
const intersections = new Set<FakeIntersectionObserver>()
class FakeIntersectionObserver {
  targets: Element[] = []
  constructor(
    public callback: (
      entries: Array<Partial<IntersectionObserverEntry>>
    ) => void
  ) {
    intersections.add(this)
  }
  observe(target: Element) {
    this.targets.push(target)
  }
  disconnect() {
    intersections.delete(this)
  }
}
const resizeAll = () => {
  for (const observer of [...resizeObservers]) {
    observer.callback()
  }
}
/** Reports every observed row as in view (or out of it). */
const intersect = (isIntersecting = true) => {
  for (const observer of [...intersections]) {
    observer.callback(
      observer.targets.map(target => ({ target, isIntersecting }))
    )
  }
}

const frames = async (n = 3) => {
  for (let i = 0; i < n; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve))
    await nextTick()
  }
}

interface Row {
  id: number
  name: string
  isExpanded?: boolean
}
const columns: Column[] = [
  { field: 'id', title: 'ID', type: 'number' },
  { field: 'name', title: 'Name' }
]
const makeRows = (count: number, from = 0): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: from + i + 1,
    name: `Name ${from + i + 1}`
  }))
const query = (page = 1, pageSize = 50): TableQuery => ({
  page,
  pageSize,
  sort: null,
  filters: []
})

interface Exposed {
  scrollToIndex(index: number, options?: { align?: string }): void
  loadMore(): void
}

let wrapper: VueWrapper | null = null
const events: Array<[TableQuery, string]> = []

const mountTable = async (
  props: Record<string, unknown> = {},
  options: { box?: boolean; slots?: Record<string, unknown> } = {}
) => {
  geo.box = options.box === false ? null : makeBox()
  const host = document.createElement('div')
  ;(geo.box ?? document.body).append(host)
  wrapper = mount(Table, {
    attachTo: host,
    props: {
      columns,
      rows: makeRows(1000),
      query: query(),
      rowKey: 'id',
      virtual: true,
      'onUpdate:query': (next: TableQuery, reason: string) => {
        events.push([next, reason])
      },
      ...props
    },
    slots: options.slots
  })
  await frames()
  return wrapper
}

const table = () => wrapper!.vm as unknown as Exposed
const box = () => geo.box!
const drawn = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      'table tbody > tr[data-row-index]:not([data-pinned-row])'
    )
  ].map(tr => Number(tr.dataset.rowIndex))
const spacerHeights = () =>
  [
    ...document.querySelectorAll<HTMLElement>('tbody > tr.qt-virtual-spacer')
  ].map(tr => parseFloat(tr.style.height))
const trOf = (index: number) =>
  document.querySelector<HTMLElement>(
    `tbody > tr[data-row-index="${index}"]:not([data-pinned-row])`
  )!

/** Scroll the box (or the window) as the user would, then let it settle. */
const scrollTo = async (top: number) => {
  if (geo.box) {
    geo.box.scrollTop = top
    geo.box.dispatchEvent(new Event('scroll'))
  } else {
    window.scrollTo({ top, behavior: 'instant' })
    window.dispatchEvent(new Event('scroll'))
  }
  await frames(4)
}

let warn: MockInstance<typeof console.warn>
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    rectOf
  )
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  Object.assign(geo, {
    view: 300,
    head: 40,
    row: 30,
    heights: new Map(),
    sticky: false,
    hidden: false,
    anchorShift: 0
  })
  events.length = 0
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  geo.box?.remove()
  geo.box = null
  document.body.innerHTML = ''
  window.scrollTo(0, 0)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('C-83 virtual rows in a fake layout', () => {
  it('draws the rows in view and the overscan, between spacers that keep the height', async () => {
    await mountTable({ virtual: { overscan: 2 } })
    // 300 px view under a 40 px header, 30 px rows: rows 0 to 8 in view,
    // 2 more below.
    expect(drawn()).toEqual([...Array(11).keys()])
    expect(spacerHeights()).toEqual([(1000 - 11) * 30])
    await scrollTo(6000)
    // The view starts at row 200 - 40 / 30 of header: rows 198 to 211 or so.
    const rows = drawn()
    expect(rows[0]).toBeGreaterThan(190)
    expect(rows.length).toBeLessThan(20)
    const [above, below] = spacerHeights()
    expect(above).toBe(rows[0] * 30)
    expect(below).toBe((1000 - rows.at(-1)! - 1) * 30)
    expect(events).toEqual([])
  })

  it('warns once about the automatic table layout', async () => {
    await mountTable()
    await scrollTo(3000)
    expect(
      warn.mock.calls.filter(call => String(call[0]).includes('table-layout'))
    ).toHaveLength(1)
  })

  it('uses virtual.scrollElement when it returns an element', async () => {
    const outer = makeBox()
    geo.box = outer
    const host = document.createElement('div')
    outer.append(host)
    wrapper = mount(Table, {
      attachTo: host,
      props: {
        columns,
        rows: makeRows(1000),
        query: query(),
        rowKey: 'id',
        virtual: { scrollElement: () => outer, rowHeight: 30 }
      }
    })
    await frames()
    await scrollTo(9000)
    expect(drawn()[0]).toBeGreaterThan(250)
  })

  it('scrolls with the window without a scrolling ancestor', async () => {
    await mountTable({ virtual: { rowHeight: 30 } }, { box: false })
    // innerHeight is 768: about 26 rows and 10 more.
    expect(drawn().length).toBeLessThan(45)
    await scrollTo(15000)
    expect(drawn()[0]).toBeGreaterThan(450)
    window.dispatchEvent(new Event('resize'))
    await frames()
    expect(drawn()[0]).toBeGreaterThan(450)
  })

  it('draws every row again without virtual, and windows again with it', async () => {
    const w = await mountTable({ virtual: { rowHeight: 30 } })
    await w.setProps({ virtual: false, rows: makeRows(40) })
    await frames()
    expect(drawn()).toHaveLength(40)
    expect(spacerHeights()).toEqual([])
    expect(document.querySelector('[aria-rowcount]')).toBeNull()
    await w.setProps({ virtual: true, rows: makeRows(1000) })
    await frames()
    expect(drawn().length).toBeLessThan(40)
  })

  it('draws pinned rows at both ends whatever the window', async () => {
    await mountTable({
      virtual: { rowHeight: 30 },
      rowPinning: { top: ['1'], bottom: ['1000'] }
    })
    await scrollTo(12000)
    const body = [...document.querySelector('tbody')!.children]
    expect(body[0].getAttribute('data-pinned-row')).toBe('top')
    expect(body[1].classList.contains('qt-virtual-spacer')).toBe(true)
    expect(body.at(-1)!.getAttribute('data-pinned-row')).toBe('bottom')
  })

  it('looks for the scroll box again once a table mounted hidden is shown', async () => {
    geo.hidden = true
    await mountTable({ virtual: { rowHeight: 30 } })
    geo.hidden = false
    resizeAll()
    await frames()
    await scrollTo(9000)
    expect(drawn()[0]).toBeGreaterThan(250)
    // Hidden again and shown again: nothing breaks.
    geo.hidden = true
    resizeAll()
    geo.hidden = false
    resizeAll()
    await frames()
    expect(drawn()[0]).toBeGreaterThan(250)
  })
})

describe('C-84 heights in a fake layout', () => {
  it('measures the drawn rows and takes the first one as the estimate', async () => {
    geo.row = 36
    await mountTable({ virtual: { overscan: 0 } })
    // Before measuring every row counted 32; after it 36.
    const [below] = spacerHeights()
    expect(below).toBe((1000 - drawn().length) * 36)
  })

  it('keeps the rows in view where they were when tall rows come in above', async () => {
    for (let i = 0; i < 1000; i += 10) {
      geo.heights.set(i, 120)
    }
    await mountTable({ virtual: { estimateRowHeight: 10, overscan: 2 } })
    await scrollTo(3000)
    const first = drawn().find(i => trOf(i).getBoundingClientRect().top > 40)!
    const top = trOf(first).getBoundingClientRect().top
    await scrollTo(box().scrollTop - 50)
    await frames(4)
    expect(trOf(first).getBoundingClientRect().top).toBeCloseTo(top + 50, -1)
  })

  it('puts back a scroll position the browser moved on its own', async () => {
    await mountTable({ virtual: { overscan: 2 } })
    const element = box()
    // The browser's scroll anchoring: when the drawn rows change it moves
    // the position at the next layout; the table undoes it.
    geo.anchorShift = 500
    await scrollTo(3000)
    expect(geo.anchorShift).toBe(0)
    expect(element.scrollTop).toBe(3000)
  })

  it('counts open subtable rows in the item and in aria-rowcount', async () => {
    const rows = makeRows(200).map((row, i) => ({
      ...row,
      isExpanded: i % 10 === 0
    }))
    await mountTable(
      { rows, hasSubtable: true, virtual: { overscan: 1 } },
      { slots: { subtable: () => h('span', 'details') } }
    )
    // Header rows + 200 rows + 20 open subtable rows.
    const count = Number(
      document.querySelector('table')!.getAttribute('aria-rowcount')
    )
    const headerRows = document.querySelectorAll('thead > tr').length
    expect(count).toBe(headerRows + 220)
    expect(
      document.querySelector('.qt-subtable-row')!.getAttribute('aria-rowindex')
    ).toBe(String(headerRows + 2))
  })

  it('keeps the measured heights by key and drops those of keys that left', async () => {
    geo.row = 36
    const w = await mountTable({ virtual: { overscan: 0 } })
    await w.setProps({ rows: makeRows(1000).reverse() })
    await frames()
    await w.setProps({ rows: makeRows(500) })
    await frames()
    expect(spacerHeights().at(-1)).toBe((500 - drawn().length) * 36)
  })
})

describe('C-86 focus and aria in a fake layout', () => {
  it('keeps a focused row drawn outside the window until the focus leaves', async () => {
    await mountTable(
      { virtual: { overscan: 2 } },
      {
        slots: {
          'cell-name': (p: { row: Row }) =>
            h('button', { class: 'cell-button' }, p.row.name)
        }
      }
    )
    const button = trOf(3).querySelector<HTMLButtonElement>('.cell-button')!
    button.focus()
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await scrollTo(15000)
    expect(drawn()).toContain(3)
    // Rows change: the focused row is found again by identity.
    await wrapper!.setProps({ rows: [makeRows(1)[0], ...makeRows(999, 1)] })
    await frames()
    // Focus moves to another row of the table: the first one is let go.
    const other = trOf(drawn().at(-1)!).querySelector('.cell-button')!
    button.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: other })
    )
    await frames()
    expect(drawn()).not.toContain(3)
  })

  it('keeps nothing for the focus on a pinned row or outside the rows', async () => {
    await mountTable(
      { virtual: { overscan: 2 }, rowPinning: { top: ['1'], bottom: [] } },
      {
        slots: {
          'cell-name': (p: { row: Row }) =>
            h('button', { class: 'cell-button' }, p.row.name)
        }
      }
    )
    const pinned = document
      .querySelector('tbody > tr[data-pinned-row]')!
      .querySelector('.cell-button')!
    pinned.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    document
      .querySelector('tbody')!
      .dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await scrollTo(15000)
    expect(drawn()[0]).toBeGreaterThan(400)
  })

  it('keeps a row drawn while the focus is in its subtable row', async () => {
    const rows = makeRows(300).map((row, i) => ({
      ...row,
      isExpanded: i === 2
    }))
    await mountTable(
      { rows, hasSubtable: true, virtual: { overscan: 2 } },
      {
        slots: {
          subtable: () => h('button', { class: 'sub-button' }, 'details')
        }
      }
    )
    const button = document.querySelector('.sub-button')!
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await scrollTo(6000)
    expect(drawn()).toContain(2)
    expect(document.querySelector('.sub-button')).not.toBeNull()
  })

  it('counts the known total of a growing infinite list and numbers no footer row', async () => {
    await mountTable({
      rows: makeRows(50),
      totalRows: 5000,
      infinite: true,
      footerRows: [{ cells: [{ field: 'name', text: 'Total' }] }]
    })
    const headerRows = document.querySelectorAll('thead > tr').length
    expect(document.querySelector('table')!.getAttribute('aria-rowcount')).toBe(
      String(headerRows + 5000 + 1)
    )
    expect(
      document.querySelector('tfoot > tr')!.hasAttribute('aria-rowindex')
    ).toBe(false)
  })

  it('numbers the footer rows after the body once the list is complete', async () => {
    await mountTable({
      rows: makeRows(20),
      footerRows: [{ cells: [{ field: 'name', text: 'Total' }] }]
    })
    const headerRows = document.querySelectorAll('thead > tr').length
    expect(
      document.querySelector('tfoot > tr')!.getAttribute('aria-rowindex')
    ).toBe(String(headerRows + 20 + 1))
  })
})

describe('C-87 print and scrollToIndex in a fake layout', () => {
  it('draws every row from beforeprint to afterprint', async () => {
    await mountTable({ rows: makeRows(300) })
    window.dispatchEvent(new Event('beforeprint'))
    await frames(1)
    expect(drawn()).toHaveLength(300)
    expect(spacerHeights()).toEqual([])
    // scrollToIndex while printing falls back to scrollIntoView.
    const into = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined)
    table().scrollToIndex(200)
    expect(into).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('afterprint'))
    await frames()
    expect(drawn().length).toBeLessThan(300)
  })

  it('draws every row while the print media query matches', async () => {
    let onChange: ((event: { matches: boolean }) => void) | null = null
    vi.spyOn(window, 'matchMedia').mockImplementation(
      media =>
        ({
          matches: false,
          media,
          addEventListener: (_: string, handler: never) => {
            onChange = handler
          },
          removeEventListener: () => undefined
        }) as unknown as MediaQueryList
    )
    await mountTable({ rows: makeRows(300) })
    onChange!({ matches: true })
    await frames(1)
    expect(drawn()).toHaveLength(300)
    onChange!({ matches: false })
    await frames()
    expect(drawn().length).toBeLessThan(300)
  })

  it.each(['start', 'center', 'end', 'auto'] as const)(
    'brings a far row into view with align %s, below the header',
    async align => {
      for (let i = 0; i < 1000; i += 7) {
        geo.heights.set(i, 90)
      }
      await mountTable()
      table().scrollToIndex(700, { align })
      await frames(6)
      const row = trOf(700).getBoundingClientRect()
      const head = document.querySelector('thead')!.getBoundingClientRect()
      expect(row.top).toBeGreaterThanOrEqual(-1)
      expect(row.bottom).toBeLessThanOrEqual(geo.view + 1)
      if (align === 'start') {
        expect(row.top).toBeCloseTo(Math.max(0, head.bottom), -1)
      }
      if (align === 'end') {
        expect(row.bottom).toBeCloseTo(geo.view, -1)
      }
      if (align === 'center') {
        expect((row.top + row.bottom) / 2).toBeCloseTo(geo.view / 2, -1)
      }
      expect(events).toEqual([])
    }
  )

  it('goes below a sticky header, and leaves a row in view where it is', async () => {
    geo.sticky = true
    await mountTable({ virtual: { rowHeight: 30 } })
    await scrollTo(6000)
    table().scrollToIndex(300, { align: 'start' })
    await frames(4)
    expect(trOf(300).getBoundingClientRect().top).toBeCloseTo(geo.head, 0)
    const before = box().scrollTop
    table().scrollToIndex(302)
    await frames(4)
    expect(box().scrollTop).toBe(before)
    // A row above the view comes in at the top, below the header.
    table().scrollToIndex(250)
    await frames(4)
    expect(trOf(250).getBoundingClientRect().top).toBeCloseTo(geo.head, 0)
  })

  it('does nothing for an index outside rows', async () => {
    await mountTable()
    table().scrollToIndex(5000)
    table().scrollToIndex(-1)
    table().scrollToIndex(1.5)
    await frames()
    expect(box().scrollTop).toBe(0)
  })

  it('calls scrollIntoView for a pinned row and without virtual', async () => {
    const into = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined)
    const w = await mountTable({
      rowPinning: { top: [], bottom: ['500'] }
    })
    table().scrollToIndex(499, { align: 'center' })
    expect(into.mock.contexts[0]).toBe(
      document.querySelector('tbody > tr[data-pinned-row="bottom"]')
    )
    expect(into.mock.calls[0][0]).toEqual({
      block: 'center',
      behavior: 'instant'
    })
    await w.setProps({ virtual: false, rows: makeRows(30), rowPinning: {} })
    await frames()
    table().scrollToIndex(20)
    expect(into.mock.calls[1][0]).toEqual({
      block: 'nearest',
      behavior: 'instant'
    })
  })

  it('drops a waiting scrollToIndex when rows change', async () => {
    const w = await mountTable({ virtual: { rowHeight: 30, overscan: 2 } })
    table().scrollToIndex(700, { align: 'start' })
    await w.setProps({ rows: makeRows(50) })
    await frames()
    await w.setProps({ rows: makeRows(1000) })
    await frames()
    await scrollTo(600 * 30)
    expect(box().scrollTop).toBe(600 * 30)
  })

  it('gives up a scrollToIndex whose row never gets drawn', async () => {
    await mountTable({ virtual: { overscan: 2 } })
    const element = box()
    // The container refuses to move (as one that cannot scroll that far).
    const restore = element.scrollTo.bind(element)
    element.scrollTo = () => undefined
    table().scrollToIndex(700, { align: 'start' })
    await frames(12)
    element.scrollTo = restore
    expect(drawn()).not.toContain(700)
    // The drift correction works again: scrolling moves the window.
    await (async () => {
      element.scrollTop = 6000
      element.dispatchEvent(new Event('scroll'))
      await frames(4)
    })()
    expect(drawn()[0]).toBeGreaterThan(150)
  })
})

describe('C-88 to C-90 infinite scroll in a fake layout', () => {
  const growing = {
    rows: makeRows(50),
    query: query(1, 50),
    infinite: true
  }

  it('asks once when the threshold row comes into view, without virtual', async () => {
    const w = await mountTable({ ...growing, virtual: false })
    expect(events).toEqual([])
    intersect(false)
    await frames()
    expect(events).toEqual([])
    intersect()
    await frames()
    expect(events.map(([q, r]) => [q.page, r])).toEqual([[2, 'page']])
    // The same query and rows: not again.
    intersect()
    await frames()
    expect(events).toHaveLength(1)
    // The rows grew: the observer moves to the new threshold row.
    await w.setProps({ rows: makeRows(100), query: query(2, 50) })
    await frames()
    const [observer] = [...intersections]
    expect(observer.targets[0].getAttribute('data-row-index')).toBe('94')
    intersect()
    await frames()
    expect(events.map(([q]) => q.page)).toEqual([2, 3])
  })

  it('counts the threshold row among the rows that are not pinned', async () => {
    await mountTable({
      ...growing,
      virtual: false,
      rowPinning: { top: ['45'], bottom: [] }
    })
    const [observer] = [...intersections]
    expect(observer.targets[0].hasAttribute('data-pinned-row')).toBe(false)
    expect(observer.targets[0].getAttribute('data-row-index')).toBe('43')
  })

  it('asks when the window reaches the last rows, with virtual', async () => {
    await mountTable({ ...growing, virtual: { overscan: 2 } })
    expect(events).toEqual([])
    await scrollTo(100000)
    expect(events.map(([q, r]) => [q.page, r])).toEqual([[2, 'page']])
  })

  it('asks for nothing while loading, then asks once loading is off', async () => {
    const w = await mountTable({ ...growing, virtual: { overscan: 2 } })
    await w.setProps({ loading: true })
    await scrollTo(100000)
    expect(events).toEqual([])
    await w.setProps({ loading: false })
    await frames()
    expect(events.map(([q]) => q.page)).toEqual([2])
  })

  it('asks for nothing at the end of the list or with an empty body', async () => {
    const w = await mountTable({
      ...growing,
      totalRows: 50,
      virtual: { overscan: 2 }
    })
    await scrollTo(100000)
    expect(events).toEqual([])
    await w.setProps({ rows: [], totalRows: null, virtual: false })
    await frames()
    expect(intersections.size).toBe(0)
    expect(events).toEqual([])
  })

  it('asks for the same page again from loadMore after an error', async () => {
    const w = await mountTable({ ...growing, virtual: { overscan: 2 } })
    await scrollTo(100000)
    expect(events).toHaveLength(1)
    // An error: loading on and off, the rows and the query stay.
    await w.setProps({ loading: true })
    await w.setProps({ loading: false })
    await frames()
    expect(events).toHaveLength(1)
    table().loadMore()
    expect(events.map(([q]) => q.page)).toEqual([2, 2])
  })

  it('warns once and asks nothing without rowKey', async () => {
    await mountTable({ ...growing, rowKey: undefined, virtual: false })
    intersect()
    table().loadMore()
    await frames()
    expect(events).toEqual([])
    expect(
      warn.mock.calls.filter(call => String(call[0]).includes('rowKey'))
    ).toHaveLength(1)
  })
})
