import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import type { LoadMoreSlotProps } from '@dolusoft/query-table'

import {
  flush,
  makeQuery,
  makeRows,
  mountTable,
  type Mounted
} from '../../support/mount-table'

// C-88 to C-90 without layout: the `load-more` slot, `loadMore` and when
// there is more to load. The automatic request needs a laid-out table and
// is in infinite.browser.spec.ts. 3.2 additions: not in a 3.1 baseline
// (`ADDED_AFTER_BASELINE`).

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
  vi.restoreAllMocks()
})

interface Box {
  slot: LoadMoreSlotProps | null
}

const mountInfinite = (props: Record<string, unknown> = {}) => {
  const box: Box = { slot: null }
  mounted = mountTable(
    {
      infinite: true,
      rowKey: 'id',
      totalRows: 20,
      query: makeQuery({ pageSize: 5 }),
      ...props
    },
    {
      slots: {
        'load-more': (slot: LoadMoreSlotProps) => {
          box.slot = slot
          return h('button', { class: 'more', onClick: slot.loadMore }, 'more')
        },
        loading: () => h('i', 'loading')
      }
    }
  )
  return { m: mounted, box }
}

const exposed = (m: Mounted) => m.wrapper.vm as unknown as { loadMore(): void }

describe('C-89 Load-more slot and method [own]', () => {
  it('ends the body with the load-more row and hands it the slot props', () => {
    const { m, box } = mountInfinite()
    const last = m.wrapper.findAll('tbody > tr').at(-1)!
    expect(last.classes()).toEqual(['qt-load-more-row'])
    expect(last.findAll('td')).toHaveLength(1)
    expect(last.find('td').attributes('colspan')).toBe('4')
    expect(box.slot).toMatchObject({ canLoadMore: true, loading: false })
  })

  it('draws the loading row instead while loading is on', async () => {
    const { m } = mountInfinite()
    await m.wrapper.setProps({ loading: true })
    expect(m.wrapper.find('.qt-load-more-row').exists()).toBe(false)
    expect(m.wrapper.find('.qt-loading-row').exists()).toBe(true)
  })

  it('draws no load-more row without infinite or without rowKey', () => {
    const off = mountInfinite({ infinite: false })
    expect(off.m.wrapper.find('.qt-load-more-row').exists()).toBe(false)
    off.m.wrapper.unmount()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const keyless = mountInfinite({ rowKey: undefined })
    expect(keyless.m.wrapper.find('.qt-load-more-row').exists()).toBe(false)
  })

  it('asks for the next page from the slot and from the exposed method', async () => {
    const { m } = mountInfinite()
    await m.wrapper.find('.more').trigger('click')
    expect(m.events).toEqual([[makeQuery({ pageSize: 5, page: 2 }), 'page']])
    // No once rule: the method asks again for the same query.
    await m.wrapper.setProps({ query: makeQuery({ pageSize: 5 }) })
    exposed(m).loadMore()
    expect(m.events).toHaveLength(2)
  })

  it('asks for nothing while loading, without more to load, or without rowKey', async () => {
    const { m } = mountInfinite()
    await m.wrapper.setProps({ loading: true })
    exposed(m).loadMore()
    await m.wrapper.setProps({ loading: false, totalRows: 5 })
    exposed(m).loadMore()
    expect(m.events).toEqual([])
    m.wrapper.unmount()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const keyless = mountInfinite({ rowKey: undefined })
    exposed(keyless.m).loadMore()
    expect(keyless.m.events).toEqual([])
  })
})

describe('C-90 End of an infinite list [own]', () => {
  const more = (props: Record<string, unknown>) => {
    const { m, box } = mountInfinite(props)
    const answer = box.slot?.canLoadMore
    m.wrapper.unmount()
    mounted = null
    return answer
  }

  it('follows the next cursor in cursor mode', () => {
    const query = { ...makeQuery({ pageSize: 5 }), cursor: null }
    expect(
      more({ query, totalRows: null, cursors: { next: 'n', prev: null } })
    ).toBe(true)
    expect(
      more({ query, totalRows: null, cursors: { next: null, prev: 'p' } })
    ).toBe(false)
    expect(more({ query, totalRows: null, cursors: null })).toBe(false)
  })

  it('compares the page with the page count when the total is known', () => {
    expect(
      more({ totalRows: 12, query: makeQuery({ pageSize: 5, page: 2 }) })
    ).toBe(true)
    expect(
      more({ totalRows: 12, query: makeQuery({ pageSize: 5, page: 3 }) })
    ).toBe(false)
  })

  it('ends at a short page when the total is unknown', () => {
    const rows = makeRows()
    expect(more({ totalRows: null, rows })).toBe(true)
    expect(more({ totalRows: null, rows: rows.slice(0, 4) })).toBe(false)
    expect(
      more({
        totalRows: null,
        rows,
        query: makeQuery({ pageSize: 5, page: 2 })
      })
    ).toBe(false)
  })
})

describe('C-88 Infinite scroll trigger [own]', () => {
  it('warns once in development when infinite has no rowKey', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mountInfinite({ rowKey: undefined })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('rowKey')
  })

  it('asks for nothing while the table mounts', async () => {
    const { m } = mountInfinite()
    await flush()
    expect(m.events).toEqual([])
  })
})
