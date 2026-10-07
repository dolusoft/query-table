import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import type { VirtualOptions } from '../contract'
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
