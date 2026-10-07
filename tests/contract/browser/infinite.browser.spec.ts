import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { h } from 'vue'

import type { LoadMoreSlotProps } from '@dolusoft/query-table'

import {
  drawnIndexes,
  frames,
  ScrollHost,
  scrollRows,
  scrollTo,
  useFixedLayout,
  type HostApi
} from '../../support/scroll-host'

// C-88 and C-89 in a real browser: the automatic request near the end of
// `rows`, with and without `virtual`, and the load-more row as a retry. 3.2
// additions: not in a 3.1 baseline (`ADDED_AFTER_BASELINE`).

let restoreLayout: () => void
beforeAll(() => {
  restoreLayout = useFixedLayout()
})
afterAll(() => restoreLayout())
afterEach(() => {
  cleanup()
})

const settle = () => frames(6)

const mount = async (
  options: {
    virtual?: boolean
    count?: number
    threshold?: number
    slots?: Record<string, unknown>
    totalRows?: number | null
  } = {}
) => {
  let api: HostApi | null = null
  await render(ScrollHost as never, {
    props: {
      rows: scrollRows(options.count ?? 50),
      pageSize: 50,
      totalRows: options.totalRows ?? null,
      tableProps: {
        infinite:
          options.threshold === undefined
            ? true
            : { threshold: options.threshold },
        virtual: options.virtual ?? false
      },
      slots: options.slots ?? {},
      api: (given: HostApi) => {
        api = given
      }
    } as never
  })
  return api!
}

const bottom = (api: HostApi) => scrollTo(api.box(), api.box().scrollHeight)

describe.each([false, true])(
  'C-88 Infinite scroll trigger, virtual %s [own]',
  virtual => {
    test('asks for the next page once when the end comes near, and again after the rows grew', async () => {
      const api = await mount({ virtual })
      // Nothing during mount; the first check waits for the layout.
      expect(api.events).toEqual([])
      await settle()
      expect(api.events).toEqual([])
      await bottom(api)
      await settle()
      expect(api.events.map(([query, reason]) => [query.page, reason])).toEqual(
        [[2, 'page']]
      )
      api.answer()
      await settle()
      expect(drawnIndexes().at(-1)).toBeGreaterThan(40)
      await bottom(api)
      await settle()
      expect(api.events.map(([query]) => query.page)).toEqual([2, 3])
    })

    test('does not ask again after an answer that changed nothing', async () => {
      const api = await mount({ virtual })
      await settle()
      await bottom(api)
      await settle()
      expect(api.events).toHaveLength(1)
      // An error: loading goes off, the rows and the query stay.
      api.answer(false)
      await settle()
      await scrollTo(api.box(), api.box().scrollTop - 200)
      await bottom(api)
      await settle()
      expect(api.events).toHaveLength(1)
    })

    test('asks for nothing while loading, or at the end of the list', async () => {
      const api = await mount({ virtual, totalRows: 50 })
      await settle()
      await bottom(api)
      await settle()
      expect(api.events).toEqual([])
    })

    test('fills a short view right after the layout', async () => {
      const api = await mount({ virtual, count: 3, totalRows: 1000 })
      expect(api.events).toEqual([])
      await settle()
      expect(api.events.map(([query, reason]) => [query.page, reason])).toEqual(
        [[2, 'page']]
      )
    })
  }
)

describe('C-89 Load-more slot and method in the browser [own]', () => {
  test('retries from the slot after an error', async () => {
    const api = await mount({
      slots: {
        'load-more': (p: LoadMoreSlotProps) =>
          h(
            'button',
            { class: 'retry', disabled: !p.canLoadMore, onClick: p.loadMore },
            'Load more'
          )
      }
    })
    await settle()
    await bottom(api)
    await settle()
    expect(api.events).toHaveLength(1)
    api.answer(false)
    await settle()
    document
      .querySelector<HTMLButtonElement>('.qt-load-more-row .retry')!
      .click()
    await settle()
    expect(api.events.map(([query]) => query.page)).toEqual([2, 2])
  })
})
