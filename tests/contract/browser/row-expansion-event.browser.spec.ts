import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import { h } from 'vue'

import type { RowExpansionPayload } from '@dolusoft/query-table'

import {
  drawnIndexes,
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  useFixedLayout,
  type HostApi
} from '../../support/scroll-host'

// C-122 in a real browser: a key press on the expand button emits once, and
// with `virtual` a row that leaves the drawn window emits nothing; its state
// stays (C-26), which the mount and unmount of its `subtable` content cannot
// tell.

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(() => {
  cleanup()
  window.scrollTo(0, 0)
})

const mount = async () => {
  const payloads: RowExpansionPayload<unknown>[] = []
  let api: HostApi | null = null
  await render(ScrollHost as never, {
    props: {
      rows: scrollRows(500),
      tableProps: {
        virtual: true,
        hasSubtable: true,
        onRowExpansionChange: (payload: RowExpansionPayload<unknown>) =>
          payloads.push(payload)
      },
      height: 300,
      totalRows: null,
      slots: {
        subtable: (p: { row: { name: string } }) =>
          h('span', { class: 'detail' }, p.row.name)
      },
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  await frames(4)
  return { api: api!, payloads }
}

const expandButton = (index: number) =>
  document.querySelector<HTMLButtonElement>(
    `.qt-table tbody > tr[data-row-index="${index}"] .qt-expand`
  )!

describe('C-122 Telling the consumer about expansion', () => {
  test('a key press emits once; a row leaving the window emits nothing', async () => {
    const { api, payloads } = await mount()
    expandButton(1).focus()
    await userEvent.keyboard('{Enter}')
    await frames(2)
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toMatchObject({
      rowIndex: 1,
      rowKey: 2,
      expanded: true
    })
    expect(document.querySelectorAll('.detail')).toHaveLength(1)

    // Row 1 leaves the drawn window: its content unmounts, its state stays.
    expandButton(1).blur()
    await scrollTo(api.box(), 8000)
    expect(drawnIndexes()).not.toContain(1)
    expect(document.querySelectorAll('.detail')).toHaveLength(0)
    await scrollTo(api.box(), 0)
    expect(drawnIndexes()).toContain(1)
    expect(document.querySelectorAll('.detail')).toHaveLength(1)
    expect(payloads).toHaveLength(1)
  })
})
