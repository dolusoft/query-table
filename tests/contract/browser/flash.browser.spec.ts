import axe from 'axe-core'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import { h } from 'vue'

import { setTheme, type Theme } from '../../../apps/playground/harness/theme'
import {
  drawnIndexes,
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  useFixedLayout,
  type HostApi,
  type ScrollRow
} from '../../support/scroll-host'

// The change flash in a real browser with the test skin (C-94, C-95): the
// skin's animations start, restart and end as the marks say, a flash that
// comes back into the window of a virtual body runs for the time it has
// left, and sorting, filtering or appending does not flash. 3.3 additions:
// not in a 3.2 baseline (`ADDED_AFTER_BASELINE`).

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(async () => {
  cleanup()
  setTheme(null)
  await commands.emulateMedia({ media: null, reducedMotion: null })
})

const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))

/** The flash animations running now, with their elements. */
const flashAnimations = () =>
  document
    .getAnimations()
    .filter(
      (animation): animation is CSSAnimation =>
        animation instanceof CSSAnimation &&
        animation.animationName.startsWith('qt-flash-')
    )

/** The element a CSS animation runs on. */
const targetOf = (animation: CSSAnimation) =>
  (animation.effect as KeyframeEffect).target as HTMLElement

/** `tr:<index>=<name>` or `td:<index>/<field or utility>=<name>`, sorted. */
const described = () =>
  flashAnimations()
    .map(animation => {
      const el = targetOf(animation)
      const tr = el.closest('tr')!
      const place =
        el.tagName === 'TR'
          ? `tr:${tr.dataset.rowIndex}`
          : `td:${tr.dataset.rowIndex}/${el.dataset.field ?? 'utility'}`
      return `${place}=${animation.animationName}`
    })
    .sort()

const cell = (index: number, field: string) =>
  document.querySelector<HTMLElement>(
    `.qt-table tbody > tr[data-row-index="${index}"] > td[data-field="${field}"]`
  )

const animationOf = (el: Element | null) =>
  flashAnimations().find(animation => targetOf(animation) === el)

/** The rows with the row of `id` changed (a new object). */
const withRow = (rows: ScrollRow[], id: number, patch: Partial<ScrollRow>) =>
  rows.map(row => (row.id === id ? { ...row, ...patch } : row))

interface Setup {
  api: HostApi
  rows: () => ScrollRow[]
  setRows: (rows: ScrollRow[]) => Promise<void>
}

const mountHost = async (
  tableProps: Record<string, unknown> = {},
  options: {
    rows?: ScrollRow[]
    height?: number
    slots?: Record<string, unknown>
  } = {}
): Promise<Setup> => {
  let api: HostApi | null = null
  let current = options.rows ?? scrollRows(20)
  await render(ScrollHost as never, {
    props: {
      rows: current,
      height: options.height ?? 0,
      slots: options.slots ?? {},
      tableProps: { flash: true, ...tableProps },
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(2)
  return {
    api: api!,
    rows: () => current,
    setRows: async rows => {
      current = rows
      api!.setRows(rows)
      await frames(2)
    }
  }
}

describe('C-94 Change flash: marks and timing [own]', () => {
  test('runs the skin animation of a changed cell and of a new row, with the skin length', async () => {
    const host = await mountHost()
    await host.setRows([
      ...withRow(host.rows(), 2, { age: 99 }),
      { id: 21, name: 'New', age: 30 }
    ])
    expect(described()).toEqual([
      'td:1/age=qt-flash-cell-a',
      'tr:20=qt-flash-row-a'
    ])
    const timing = animationOf(cell(1, 'age'))!.effect!.getComputedTiming()
    expect(timing.activeDuration).toBe(2000)
    // Bound in the update that started it: no time gone, nothing written.
    expect(Math.abs(timing.delay ?? 0)).toBe(0)
    expect(cell(1, 'age')!.style.getPropertyValue('--qt-flash-elapsed')).toBe(
      ''
    )
    expect(
      document.querySelector('.qt-table [style*="--qt-flash-elapsed"]')
    ).toBeNull()
  })

  test('reads the length from an ancestor of the table root', async () => {
    const wrapper = document.createElement('div')
    wrapper.style.setProperty('--qt-flash-duration', '400ms')
    document.body.append(wrapper)
    const style = document.createElement('style')
    // The skin sets the length on the root; this page leaves it to the
    // wrapper.
    style.textContent =
      '.qt-datatable.qt-datatable { --qt-flash-duration: inherit; }'
    document.head.append(style)
    try {
      let api: HostApi | null = null
      await render(ScrollHost as never, {
        container: wrapper,
        props: {
          rows: scrollRows(5),
          height: 0,
          tableProps: { flash: true },
          api: (given: HostApi) => {
            api = given
          }
        } as never
      })
      await frames(2)
      api!.setRows(withRow(scrollRows(5), 1, { age: 99 }))
      await frames(2)
      expect(
        animationOf(cell(0, 'age'))!.effect!.getComputedTiming().activeDuration
      ).toBe(400)
      await sleep(500)
      expect(cell(0, 'age')!.hasAttribute('data-flash')).toBe(false)
    } finally {
      style.remove()
      cleanup()
      wrapper.remove()
    }
  })

  test('a cell that changes again starts over under the other name', async () => {
    const host = await mountHost()
    await host.setRows(withRow(host.rows(), 3, { age: 90 }))
    await sleep(300)
    await host.setRows(withRow(host.rows(), 3, { age: 91 }))
    const animation = animationOf(cell(2, 'age'))!
    expect(animation.animationName).toBe('qt-flash-cell-b')
    expect(Number(animation.currentTime)).toBeLessThan(100)
    expect(flashAnimations()).toHaveLength(1)
  })

  test('a flash that comes back into a virtual window runs for the time it has left', async () => {
    const rows = scrollRows(500)
    const host = await mountHost(
      { virtual: { rowHeight: 37 } },
      { rows, height: 300 }
    )
    const box = host.api.box()
    await host.setRows(withRow(host.rows(), 1, { age: 99 }))
    const start = performance.now()
    expect(animationOf(cell(0, 'age'))).toBeDefined()
    await sleep(300)
    await scrollTo(box, 6000)
    expect(drawnIndexes()).not.toContain(0)
    expect(cell(0, 'age')).toBeNull()
    await sleep(1000 - (performance.now() - start))
    await scrollTo(box, 0)
    const back = cell(0, 'age')!
    const animation = animationOf(back)!
    const elapsed = performance.now() - start
    const timing = animation.effect!.getComputedTiming()
    const remaining = Math.max(
      0,
      Number(timing.endTime) - Number(timing.localTime)
    )
    expect(timing.activeDuration).toBe(2000)
    // StkTableVue's resumed fade ran about half of this.
    expect(Math.abs(remaining - (2000 - elapsed))).toBeLessThan(50)
    const written = parseFloat(
      back.style.getPropertyValue('--qt-flash-elapsed')
    )
    expect(written).toBeGreaterThan(900)
    // Bound once: a scroll that keeps the row drawn leaves the value.
    await scrollTo(box, 20)
    expect(cell(0, 'age')).toBe(back)
    expect(parseFloat(back.style.getPropertyValue('--qt-flash-elapsed'))).toBe(
      written
    )
  })

  test('a flash whose time is up is not drawn when its row comes back', async () => {
    const host = await mountHost(
      { virtual: { rowHeight: 37 }, style: '--qt-flash-duration: 400ms' },
      { rows: scrollRows(500), height: 300 }
    )
    const box = host.api.box()
    await host.setRows(withRow(host.rows(), 1, { age: 99 }))
    await scrollTo(box, 6000)
    await sleep(500)
    await scrollTo(box, 0)
    expect(cell(0, 'age')!.hasAttribute('data-flash')).toBe(false)
    expect(flashAnimations()).toEqual([])
  })

  test('an animation inside a cell does not end the flash of the cell', async () => {
    const style = document.createElement('style')
    style.textContent =
      '@keyframes inner-spin { to { transform: rotate(1turn); } } .inner-spin { display: inline-block; animation: inner-spin 50ms 2; } .inner-spin::after { content: "*"; animation: inner-spin 30ms; }'
    document.head.append(style)
    try {
      const host = await mountHost(
        { hasSubtable: true },
        {
          slots: {
            'cell-age': (p: { cellValue: unknown }) =>
              h('span', { class: 'inner-spin' }, String(p.cellValue)),
            subtable: () => h('span', { class: 'inner-spin' }, 'details')
          }
        }
      )
      await userEvent.click(document.querySelector('.qt-expand')!)
      await host.setRows(withRow(host.rows(), 1, { age: 99 }))
      await sleep(300)
      expect(cell(0, 'age')!.dataset.flash).toBe('a')
      expect(animationOf(cell(0, 'age'))!.playState).toBe('running')
    } finally {
      style.remove()
    }
  })

  test('a row flash animates the pinned cells of its row and every cell of a pinned row; a cell flash stays on its cell', async () => {
    const host = await mountHost({
      hasSubtable: true,
      columns: [
        { field: 'id', title: 'ID', type: 'number', pinned: 'left' },
        { field: 'name', title: 'Name' },
        { field: 'age', title: 'Age', type: 'number' }
      ],
      rowPinning: { top: ['21'], bottom: [] }
    })
    await host.setRows([
      ...withRow(host.rows(), 2, { name: 'Changed' }),
      { id: 21, name: 'New', age: 30 },
      { id: 22, name: 'Newer', age: 31 }
    ])
    const names = described()
    // The pinned new row: the row and every cell, the utility cell included.
    const top = document.querySelector<HTMLElement>(
      '.qt-table tbody > tr[data-pinned-row="top"]'
    )!
    const topIndex = top.dataset.rowIndex
    expect(names).toEqual(
      expect.arrayContaining([
        `tr:${topIndex}=qt-flash-row-a`,
        `td:${topIndex}/utility=qt-flash-row-a`,
        `td:${topIndex}/id=qt-flash-row-a`,
        `td:${topIndex}/name=qt-flash-row-a`,
        `td:${topIndex}/age=qt-flash-row-a`
      ])
    )
    // The other new row is not pinned: its opaque cells only, the pinned
    // column and the utility cell pinned with it (C-46).
    const other = document.querySelector<HTMLElement>(
      '.qt-table tbody > tr[data-row-index]:not([data-pinned-row])[data-flash]'
    )!
    const otherIndex = other.dataset.rowIndex
    expect(names.filter(name => name.startsWith(`td:${otherIndex}/`))).toEqual([
      `td:${otherIndex}/id=qt-flash-row-a`,
      `td:${otherIndex}/utility=qt-flash-row-a`
    ])
    // A changed cell flashes alone, in its own color.
    expect(names.filter(name => name.startsWith('td:1/'))).toEqual([
      'td:1/name=qt-flash-cell-a'
    ])
    const changed = cell(1, 'name')!
    const plain = cell(1, 'age')!
    expect(getComputedStyle(changed).animationName).toBe('qt-flash-cell-a')
    expect(getComputedStyle(plain).animationName).toBe('none')
  })
})
describe('C-93 Change flash: what flashes [own]', () => {
  test('sorting clears the flashes and its answer does not flash', async () => {
    const host = await mountHost({ sortable: true })
    await host.setRows(withRow(host.rows(), 1, { age: 99 }))
    expect(flashAnimations()).toHaveLength(1)
    await userEvent.click(
      document.querySelector('th[data-field="age"] .qt-sort')!
    )
    await frames(2)
    expect(host.api.events.map(([, reason]) => reason)).toEqual(['sort'])
    await host.setRows(
      [...host.rows()]
        .sort((a, b) => a.age - b.age)
        .map(row => ({ ...row, age: row.age + 1 }))
    )
    expect(flashAnimations()).toEqual([])
    expect(document.querySelector('.qt-table [data-flash]')).toBeNull()
  })

  test.each([[undefined], ['live' as const]])(
    'a filter answer does not flash (hint %s)',
    async hint => {
      const host = await mountHost({ filterable: true, rowsUpdate: hint })
      await userEvent.fill(
        document.querySelector<HTMLInputElement>(
          'th[data-field="name"] input'
        )!,
        'Name 1'
      )
      await sleep(200)
      expect(host.api.events.map(([, reason]) => reason)).toEqual(['filter'])
      await host.setRows(
        host
          .rows()
          .filter(row => row.name.startsWith('Name 1'))
          .map(row => ({ ...row, age: 0 }))
      )
      expect(flashAnimations()).toEqual([])
    }
  )

  test('an appended page does not flash', async () => {
    const host = await mountHost(
      { infinite: true, virtual: { rowHeight: 37 } },
      { rows: scrollRows(50), height: 300 }
    )
    host.api.table().loadMore()
    await frames(2)
    host.api.answer()
    await frames(2)
    expect(
      document.querySelectorAll('.qt-table tbody > tr[data-row-index]').length
    ).toBeGreaterThan(0)
    expect(flashAnimations()).toEqual([])
    expect(host.api.events.map(([, reason]) => reason)).toEqual(['page'])
  })
})

describe('C-94 Change flash: the skin [own]', () => {
  test('a theme switch keeps the progress and the end, and takes the new color', async () => {
    setTheme('light')
    const host = await mountHost()
    await host.setRows(withRow(host.rows(), 1, { age: 99 }))
    const animation = animationOf(cell(0, 'age'))!
    animation.pause()
    animation.currentTime = 0
    const light = getComputedStyle(cell(0, 'age')!).backgroundColor
    const before = animation.effect!.getComputedTiming()
    setTheme('dark')
    await frames(2)
    const dark = getComputedStyle(cell(0, 'age')!).backgroundColor
    const after = animation.effect!.getComputedTiming()
    expect(animationOf(cell(0, 'age'))).toBe(animation)
    expect(dark).not.toBe(light)
    expect(after.endTime).toBe(before.endTime)
    expect(after.localTime).toBe(before.localTime)
  })

  test('reduced motion: the skin sets no length and the table marks nothing', async () => {
    await commands.emulateMedia({ reducedMotion: 'reduce' })
    const host = await mountHost()
    await host.setRows(withRow(host.rows(), 1, { age: 99 }))
    expect(document.querySelector('.qt-table [data-flash]')).toBeNull()
    expect(flashAnimations()).toEqual([])
  })

  test('a skin with a still mark (animation: none): the mark still ends with its length', async () => {
    const style = document.createElement('style')
    style.textContent =
      '.qt-datatable.qt-datatable { --qt-flash-duration: 300ms; } .qt-table.qt-table tbody td[data-flash] { animation: none; outline: 2px solid currentColor; }'
    document.head.append(style)
    try {
      const host = await mountHost()
      await host.setRows(withRow(host.rows(), 1, { age: 99 }))
      expect(cell(0, 'age')!.dataset.flash).toBe('a')
      expect(flashAnimations()).toEqual([])
      await sleep(400)
      expect(cell(0, 'age')!.hasAttribute('data-flash')).toBe(false)
    } finally {
      style.remove()
    }
  })

  test('print: no flash animation on paper, and no replay after it', async () => {
    const host = await mountHost({ style: '--qt-flash-duration: 300ms' })
    await host.setRows(withRow(host.rows(), 1, { age: 99 }))
    await commands.emulateMedia({ media: 'print' })
    await frames(2)
    expect(cell(0, 'age')!.dataset.flash).toBe('a')
    expect(flashAnimations()).toEqual([])
    await sleep(400)
    await commands.emulateMedia({ media: 'screen' })
    await frames(2)
    expect(cell(0, 'age')!.hasAttribute('data-flash')).toBe(false)
    expect(flashAnimations()).toEqual([])
  })

  test.each<Theme>(['light', 'dark'])(
    'finds no accessibility violation at the full flash color (axe), %s theme',
    async theme => {
      setTheme(theme)
      const host = await mountHost()
      await host.setRows([
        ...withRow(host.rows(), 1, { age: 99 }),
        { id: 21, name: 'New', age: 30 }
      ])
      for (const animation of flashAnimations()) {
        animation.pause()
        animation.currentTime = 0
      }
      const result = await axe.run(document.querySelector('.qt-datatable')!, {
        resultTypes: ['violations']
      })
      expect(
        result.violations.map(
          violation =>
            `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`
        )
      ).toEqual([])
    }
  )
})

describe('C-95 Change flash off and DOM contract of 3.3 [own]', () => {
  test('a virtual infinite list gives the same update:query trace with flash on and off', async () => {
    const trace = async (flash: boolean) => {
      const host = await mountHost(
        { flash, infinite: { threshold: 2 }, virtual: { rowHeight: 37 } },
        { rows: scrollRows(50), height: 300 }
      )
      const box = host.api.box()
      await host.setRows(withRow(host.rows(), 1, { age: 99 }))
      await scrollTo(box, 1000)
      await scrollTo(box, 100000)
      host.api.answer()
      await frames(4)
      await scrollTo(box, 0)
      const events = host.api.events.map(([query, reason]) => [
        JSON.stringify(query),
        reason
      ])
      const drawn = drawnIndexes()
      cleanup()
      return { events, drawn }
    }
    const off = await trace(false)
    const on = await trace(true)
    expect(on).toEqual(off)
    expect(off.events.length).toBeGreaterThan(0)
  })
})
