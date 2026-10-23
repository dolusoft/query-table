import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import { h } from 'vue'

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

// C-109 to C-111 in a real browser: the keys, the rows they pass over, the
// row drawn and shown whole in a virtual body, below a sticky header and a
// sticky group row, the focus put back, and the navigation off. 3.12
// additions: not in a 3.11 baseline (`ADDED_AFTER_BASELINE`).

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(() => {
  cleanup()
  window.scrollTo(0, 0)
})

const HEAD = 32
const ROW = 30
const GROUP = 24

/**
 * A sticky header and sticky group cells, as a skin would make them, with
 * fixed heights. The box scrolls; the test skin's `qt-table-responsive` must
 * not be a scroll container of its own, or nothing sticks to the box.
 */
const useStickySkin = () => {
  const style = document.createElement('style')
  style.textContent = `
    .qt-table-responsive.qt-table-responsive { overflow: visible; }
    .qt-table thead { position: sticky; top: 0; z-index: 2; background: white; }
    .qt-table thead tr:not(:first-child) { display: none; }
    .qt-table thead th { height: ${HEAD}px; padding: 0; border: 0; box-sizing: border-box; }
    .qt-table tbody > tr.qt-group-row > th { position: sticky; top: ${HEAD}px; z-index: 1; background: white; height: ${GROUP}px; padding: 0; border: 0; box-sizing: border-box; }
    .qt-table tbody > tr > td { height: ${ROW}px; padding: 0; border: 0; box-sizing: border-box; }
    .qt-table tbody > tr { border: 0; }
    .qt-table tr.qt-virtual-spacer > td { height: auto; }
  `
  document.head.append(style)
  return () => style.remove()
}

type Focused = { row: ScrollRow; rowIndex: number; key: string }

/** A `cell-name` slot that draws the row's focus target, a button. */
const buttonSlot = (when: (row: ScrollRow) => boolean = () => true) => ({
  'cell-name': ({ row }: { row: ScrollRow }) =>
    when(row)
      ? h('button', { type: 'button', 'data-row': '' }, row.name)
      : row.name
})

const mount = async (
  options: {
    count?: number
    tableProps?: Record<string, unknown>
    slots?: Record<string, unknown>
    height?: number
  } = {}
) => {
  let api: HostApi | null = null
  const focused: Focused[] = []
  await render(ScrollHost as never, {
    props: {
      rows: scrollRows(options.count ?? 1000),
      tableProps: {
        rowNavigation: { focus: '[data-row]' },
        onRowFocus: (payload: Focused) => focused.push(payload),
        ...options.tableProps
      },
      height: options.height ?? 300,
      slots: options.slots ?? buttonSlot(),
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(4)
  return { api: api!, focused }
}

/** The focus target of the row with this index, when it is drawn. */
const target = (index: number) =>
  document.querySelector<HTMLElement>(
    `.qt-table tbody > tr[data-row-index="${index}"] [data-row]`
  )

/** The index of the row that holds the focus, or `null`. */
const focusedIndex = () => {
  const tr = document.activeElement?.closest<HTMLElement>(
    '.qt-table tbody > tr[data-row-index]'
  )
  return tr ? Number(tr.dataset.rowIndex) : null
}

const press = async (key: string, settle = 3) => {
  await userEvent.keyboard(`{${key}}`)
  await frames(settle)
}

/** The row's place in the box: whole and below the covers above it. */
const placeOf = (index: number, box: HTMLElement) => {
  const row = document
    .querySelector(`.qt-table tbody > tr[data-row-index="${index}"]`)!
    .getBoundingClientRect()
  const view = box.getBoundingClientRect()
  return {
    top: Math.round(row.top - view.top),
    bottom: Math.round(view.bottom - row.bottom)
  }
}

describe('C-109 Row navigation [own]', () => {
  for (const virtual of [false, true]) {
    test(`ArrowDown and ArrowUp move to the next and previous row and emit rowFocus (virtual: ${virtual})`, async () => {
      const { focused } = await mount({
        count: virtual ? 1000 : 40,
        tableProps: { virtual }
      })
      target(0)!.focus()
      await press('ArrowDown')
      expect(document.activeElement).toBe(target(1))
      await press('ArrowDown')
      expect(document.activeElement).toBe(target(2))
      await press('ArrowUp')
      expect(document.activeElement).toBe(target(1))
      expect(focused.map(f => [f.rowIndex, f.row.id, f.key])).toEqual([
        [1, 2, 'ArrowDown'],
        [2, 3, 'ArrowDown'],
        [1, 2, 'ArrowUp']
      ])
    })
  }

  test('a handled key prevents its default, also at the first row where nothing moves', async () => {
    const { api, focused } = await mount({ count: 40 })
    const box = api.box()
    target(0)!.focus()
    const events: KeyboardEvent[] = []
    const record = (e: KeyboardEvent) => events.push(e)
    document.addEventListener('keydown', record)
    await press('ArrowUp')
    await press('Home')
    document.removeEventListener('keydown', record)
    expect(events.map(e => e.defaultPrevented)).toEqual([true, true])
    expect(document.activeElement).toBe(target(0))
    expect(box.scrollTop).toBe(0)
    expect(focused).toEqual([])
  })

  test('Home and End go to the first and last row, out of the window too', async () => {
    const { api, focused } = await mount({ tableProps: { virtual: true } })
    target(0)!.focus()
    await press('End', 8)
    expect(focusedIndex()).toBe(999)
    expect(drawnIndexes()).toContain(999)
    const place = placeOf(999, api.box())
    expect(place.bottom).toBeGreaterThanOrEqual(0)
    await press('Home', 8)
    expect(focusedIndex()).toBe(0)
    expect(focused.map(f => [f.rowIndex, f.key])).toEqual([
      [999, 'End'],
      [0, 'Home']
    ])
  })

  test('skip names the rows the keys pass over; Home and End stop at the first and last row not skipped', async () => {
    const skip = (row: ScrollRow) => row.id % 3 === 0 || row.id === 1
    const { focused } = await mount({
      count: 30,
      tableProps: { rowNavigation: { focus: '[data-row]', skip } }
    })
    target(1)!.focus()
    // Index 2 is id 3: skipped.
    await press('ArrowDown')
    expect(focusedIndex()).toBe(3)
    await press('ArrowUp')
    expect(focusedIndex()).toBe(1)
    // Index 29 is id 30: skipped; index 0 is id 1: skipped.
    await press('End')
    expect(focusedIndex()).toBe(28)
    await press('Home')
    expect(focusedIndex()).toBe(1)
    expect(focused.map(f => f.rowIndex)).toEqual([3, 1, 28, 1])
  })

  test('group rows and subtable rows are passed over', async () => {
    const { focused } = await mount({
      count: 20,
      tableProps: {
        groupBy: (row: ScrollRow) => `g${Math.floor((row.id - 1) / 5)}`,
        hasSubtable: true,
        rowNavigation: { focus: '[data-row]' }
      },
      slots: {
        ...buttonSlot(),
        subtable: () => h('button', { type: 'button' }, 'detail')
      }
    })
    // Open row 4: its subtable row sits between rows 4 and 5, and the group
    // row of g1 too.
    document
      .querySelector<HTMLElement>('tr[data-row-index="4"] .qt-expand')!
      .click()
    await frames(2)
    expect(document.querySelector('.qt-subtable-row')).not.toBeNull()
    target(4)!.focus()
    await press('ArrowDown')
    expect(focusedIndex()).toBe(5)
    await press('ArrowUp')
    expect(focusedIndex()).toBe(4)
    expect(focused.map(f => f.rowIndex)).toEqual([5, 4])
  })

  test('without focus the first focusable element of a row is its target', async () => {
    const { focused } = await mount({
      count: 20,
      tableProps: { rowNavigation: true, selection: {} }
    })
    const checkbox = (index: number) =>
      document.querySelector(
        `tr[data-row-index="${index}"] input.qt-select-row`
      )
    ;(checkbox(0) as HTMLElement).focus()
    await press('ArrowDown')
    expect(document.activeElement).toBe(checkbox(1))
    // The button is not the target: its keys do nothing.
    target(1)!.focus()
    await press('ArrowDown')
    expect(document.activeElement).toBe(target(1))
    expect(focused.map(f => f.rowIndex)).toEqual([1])
  })

  test('a key off a focus target or with a modifier does nothing', async () => {
    const { focused } = await mount({
      count: 20,
      tableProps: { selection: {} }
    })
    const checkbox = document.querySelector<HTMLElement>(
      'tr[data-row-index="0"] input.qt-select-row'
    )!
    checkbox.focus()
    await press('ArrowDown')
    expect(document.activeElement).toBe(checkbox)
    target(0)!.focus()
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
    await userEvent.keyboard('{Control>}{End}{/Control}')
    await frames(3)
    expect(document.activeElement).toBe(target(0))
    expect(focused).toEqual([])
  })

  test('a row with no focus target ends the move without an event', async () => {
    const { focused } = await mount({
      count: 20,
      slots: buttonSlot(row => row.id !== 3)
    })
    target(1)!.focus()
    await press('ArrowDown')
    expect(document.activeElement).toBe(target(1))
    expect(focused).toEqual([])
  })

  test('pinned rows come in drawing order: top, the others, bottom', async () => {
    const { focused } = await mount({
      count: 10,
      tableProps: { rowPinning: { top: ['5'], bottom: ['2'] } }
    })
    target(4)!.focus()
    await press('ArrowDown')
    expect(focusedIndex()).toBe(0)
    await press('End')
    expect(focusedIndex()).toBe(1)
    await press('Home')
    expect(focusedIndex()).toBe(4)
    expect(focused.map(f => f.rowIndex)).toEqual([0, 1, 4])
  })
})

describe('C-110 Row navigation: drawing and showing the row [own]', () => {
  for (const virtual of [false, true]) {
    test(`the row is shown whole, below the sticky header (virtual: ${virtual})`, async () => {
      const restore = useStickySkin()
      try {
        const { api } = await mount({
          count: virtual ? 1000 : 60,
          tableProps: { virtual }
        })
        const box = api.box()
        target(0)!.focus()
        // Down past the bottom edge of the box.
        for (let i = 1; i <= 12; i++) {
          await press('ArrowDown')
          expect(focusedIndex()).toBe(i)
          const place = placeOf(i, box)
          expect(place.bottom).toBeGreaterThanOrEqual(0)
          expect(place.top).toBeGreaterThanOrEqual(HEAD)
        }
        // Up again: each row comes in below the sticky header, not under it.
        for (let i = 11; i >= 0; i--) {
          await press('ArrowUp')
          expect(focusedIndex()).toBe(i)
          expect(placeOf(i, box).top).toBeGreaterThanOrEqual(HEAD)
        }
      } finally {
        restore()
      }
    })
  }

  for (const virtual of [false, true]) {
    test(`a row of a group goes below the sticky group row (virtual: ${virtual})`, async () => {
      const restore = useStickySkin()
      try {
        const { api } = await mount({
          count: virtual ? 1000 : 400,
          tableProps: {
            virtual,
            groupBy: (row: ScrollRow) => `g${Math.floor((row.id - 1) / 100)}`
          }
        })
        const box = api.box()
        await scrollTo(box, 150 * ROW)
        const first = drawnIndexes().find(i => i > 150)!
        target(first + 8)!.focus()
        for (let i = first + 7; i >= first - 3; i--) {
          await press('ArrowUp')
          expect(focusedIndex()).toBe(i)
          expect(placeOf(i, box).top).toBeGreaterThanOrEqual(HEAD + GROUP)
        }
      } finally {
        restore()
      }
    })
  }

  test('a row with an open subtable taller than the box is shown, not its subtable', async () => {
    const restore = useStickySkin()
    try {
      const { api } = await mount({
        count: 40,
        tableProps: { hasSubtable: true },
        slots: {
          ...buttonSlot(),
          subtable: () => h('div', { style: 'height: 600px' }, 'detail')
        }
      })
      const box = api.box()
      document
        .querySelector<HTMLElement>('tr[data-row-index="8"] .qt-expand')!
        .click()
      await frames(2)
      target(7)!.focus()
      await press('ArrowDown')
      expect(focusedIndex()).toBe(8)
      const place = placeOf(8, box)
      expect(place.top).toBeGreaterThanOrEqual(HEAD)
      expect(place.bottom).toBeGreaterThanOrEqual(0)
    } finally {
      restore()
    }
  })

  test('End then Home at once: the view follows the row that has the focus', async () => {
    const restore = useStickySkin()
    try {
      const { api } = await mount({ tableProps: { virtual: true } })
      const box = api.box()
      target(0)!.focus()
      await userEvent.keyboard('{End}{Home}')
      await frames(10)
      expect(focusedIndex()).toBe(0)
      expect(placeOf(0, box).top).toBeGreaterThanOrEqual(HEAD)
      expect(placeOf(0, box).bottom).toBeGreaterThanOrEqual(0)
    } finally {
      restore()
    }
  })

  test('the move goes by key: rows added while the row is drawn do not move it to another row', async () => {
    const { api, focused } = await mount({ tableProps: { virtual: true } })
    target(0)!.focus()
    // Before the window has drawn the last row, two rows come in at the top.
    document.addEventListener(
      'keydown',
      () => api.setRows([...scrollRows(2, 5000), ...scrollRows(1000)]),
      { once: true }
    )
    await userEvent.keyboard('{End}')
    await frames(10)
    expect(focusedIndex()).toBe(1001)
    expect(focused.map(f => [f.rowIndex, f.row.id])).toEqual([[1001, 1000]])
  })

  test('a key pressed while a move waits moves on from the row it waits for', async () => {
    const { focused } = await mount({ tableProps: { virtual: true } })
    target(0)!.focus()
    await userEvent.keyboard('{End}{ArrowUp}')
    await frames(10)
    expect(focusedIndex()).toBe(998)
    expect(focused.map(f => [f.rowIndex, f.key])).toEqual([[998, 'ArrowUp']])
  })

  test('a focus taken off the target right after it landed is put back, without a second event', async () => {
    const { focused } = await mount({ count: 40 })
    target(0)!.focus()
    await userEvent.keyboard('{ArrowDown}')
    ;(document.activeElement as HTMLElement).blur()
    expect(document.activeElement).toBe(document.body)
    await frames(3)
    expect(document.activeElement).toBe(target(1))
    expect(focused.map(f => f.rowIndex)).toEqual([1])
  })

  test('a focus moved to another element ends the move', async () => {
    const outside = document.createElement('input')
    document.body.append(outside)
    try {
      const { focused } = await mount({ tableProps: { virtual: true } })
      target(0)!.focus()
      // Before the window has drawn the last row, a script moves the focus.
      document.addEventListener('keydown', () => outside.focus(), {
        once: true
      })
      await userEvent.keyboard('{End}')
      await frames(10)
      expect(document.activeElement).toBe(outside)
      expect(focused).toEqual([])
    } finally {
      outside.remove()
    }
  })

  test('with scrollBody the row is shown whole in the body', async () => {
    const style = document.createElement('style')
    style.textContent =
      '.qt-table-body { height: 240px; overflow-y: scroll; } .qt-table-head, .qt-table-foot { overflow-y: scroll; }'
    document.head.append(style)
    try {
      await mount({
        tableProps: { virtual: true, scrollBody: true },
        height: 0
      })
      const body = document.querySelector<HTMLElement>('.qt-table-body')!
      target(0)!.focus()
      for (let i = 1; i <= 12; i++) {
        await press('ArrowDown')
        expect(focusedIndex()).toBe(i)
      }
      const place = placeOf(12, body)
      expect(place.bottom).toBeGreaterThanOrEqual(0)
      expect(place.top).toBeGreaterThanOrEqual(0)
    } finally {
      style.remove()
    }
  })
})

describe('C-111 Row navigation off and DOM contract of 3.12 [own]', () => {
  /** The `keydown` listeners added to the table's elements while it mounts. */
  const keydownTargets = async (tableProps: Record<string, unknown>) => {
    const targets: Element[] = []
    // Called back with `apply` and the element as `this`, then restored.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = EventTarget.prototype.addEventListener
    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      ...args: Parameters<EventTarget['addEventListener']>
    ) {
      if (this instanceof Element && args[0] === 'keydown') {
        targets.push(this)
      }
      original.apply(this, args)
    }
    try {
      await mount({ count: 20, tableProps })
    } finally {
      EventTarget.prototype.addEventListener = original
    }
    return targets
      .filter(element => element.closest('.qt-datatable'))
      .map(element => element.tagName)
  }

  test('off, no keydown listener and the keys do nothing', async () => {
    expect(await keydownTargets({ rowNavigation: false })).toEqual([])
    cleanup()
    const { focused } = await mount({
      count: 20,
      tableProps: { rowNavigation: false }
    })
    target(0)!.focus()
    await press('ArrowDown')
    expect(document.activeElement).toBe(target(0))
    expect(focused).toEqual([])
  })

  test('on, one keydown listener on the tbody and no tabindex or attribute', async () => {
    expect(await keydownTargets({})).toEqual(['TBODY'])
    const rows = [...document.querySelectorAll('.qt-table tbody > tr')]
    expect(rows.some(tr => tr.hasAttribute('tabindex'))).toBe(false)
  })
})
