import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import type { VirtualOptions } from '../contract'
import type { BodyRow } from '../use-query-table'
import { useRowWindow } from './use-row-window'

describe('C-83 use-row-window', () => {
  it('compares the virtual options by value: an equal new object draws nothing again', async () => {
    const options = shallowRef<VirtualOptions>({ overscan: 5 })
    const rows = Array.from({ length: 100 }, (_, i) => ({
      row: { id: i },
      index: i,
      pinned: false as const
    }))
    let window: ReturnType<typeof useRowWindow<{ id: number }>> | null = null
    mount(
      defineComponent({
        setup() {
          window = useRowWindow({
            virtual: () => options.value,
            table: shallowRef(null),
            bodyRows: () => rows,
            keyOf: row => row.id,
            isExpanded: () => false
          })
          return () => h('div')
        }
      })
    )
    const before = window!.drawn.value
    options.value = { overscan: 5 }
    await nextTick()
    expect(window!.drawn.value).toBe(before)
    options.value = { overscan: 6 }
    await nextTick()
    expect(window!.drawn.value).not.toBe(before)
  })
})

describe('C-110 use-row-window reveal', () => {
  it('scrolls the nearest container so a drawn row is whole; a row not drawn, or no table, does nothing', () => {
    const rows: Array<BodyRow<{ id: number }>> = Array.from(
      { length: 5 },
      (_, i) => ({ row: { id: i }, index: i, pinned: i === 0 ? 'top' : false })
    )
    const table = shallowRef<HTMLTableElement | null>(null)
    let api: ReturnType<typeof useRowWindow<{ id: number }>> | null = null
    const wrapper = mount(
      defineComponent({
        setup() {
          api = useRowWindow({
            virtual: () => false,
            table,
            bodyRows: () => rows,
            keyOf: row => row.id,
            isExpanded: () => false
          })
          return () => h('div')
        }
      })
    )
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    api!.reveal(1)
    expect(scrollTo).not.toHaveBeenCalled()
    const element = document.createElement('table')
    element.innerHTML =
      '<tbody><tr data-row-index="0" data-pinned-row="top"></tr><tr data-row-index="1"></tr></tbody>'
    document.body.append(element)
    table.value = element
    const row = element.querySelector('tr[data-row-index="1"]')!
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      top: -40,
      bottom: -10,
      height: 30
    } as DOMRect)
    api!.reveal(1)
    expect(scrollTo).toHaveBeenCalledWith({ top: -40, behavior: 'instant' })
    // A pinned row in view, and a row not drawn: nothing to scroll.
    scrollTo.mockClear()
    api!.reveal(0)
    api!.reveal(7)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(api!.busy()).toBe(false)
    wrapper.unmount()
    element.remove()
    vi.restoreAllMocks()
  })
})
