import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import { useScrollBody } from './use-scroll-body'

// C-101: the sideways scroll of the three wrappers of `scrollBody`, without
// a layout. The browser spec (scroll-body.browser.spec) checks it with one;
// here `scrollLeft` is a plain number, clamped where a test gives a limit.

const mounted: VueWrapper[] = []
afterEach(() => {
  mounted.splice(0).forEach(wrapper => {
    wrapper.unmount()
  })
  vi.restoreAllMocks()
})

/** Writes to the `scrollLeft` of each wrapper `box` made. */
const writes = new WeakMap<HTMLElement, number>()

/** A wrapper whose `scrollLeft` stops at `max`, as a scroll box does. */
const box = (max = Infinity) => {
  const element = document.createElement('div')
  let left = 0
  Object.defineProperty(element, 'scrollLeft', {
    get: () => left,
    set: (value: number) => {
      writes.set(element, (writes.get(element) ?? 0) + 1)
      left = Math.max(0, Math.min(max, value))
    }
  })
  return element
}

/** The user (or the browser) scrolls `element` to `left`. */
const scroll = (element: HTMLElement, left: number) => {
  element.scrollLeft = left
  element.dispatchEvent(new Event('scroll'))
}

const setup = (options: { headMax?: number; layout?: string } = {}) => {
  const enabled = shallowRef(true)
  const head = shallowRef<HTMLElement | null>(box(options.headMax))
  const body = shallowRef<HTMLElement | null>(box())
  const foot = shallowRef<HTMLElement | null>(box())
  const table = document.createElement('table')
  table.style.tableLayout = options.layout ?? 'fixed'
  document.body.append(table)
  const wrapper = mount(
    defineComponent({
      setup() {
        useScrollBody({
          enabled: () => enabled.value,
          wrappers: () => ({
            head: head.value,
            body: body.value,
            foot: foot.value
          }),
          bodyTable: () => table
        })
        return () => h('div')
      }
    })
  )
  mounted.push(wrapper)
  return { enabled, head, body, foot, wrapper }
}

describe('C-101 Scrolling body: sideways together (unit) [own]', () => {
  it('sets the header and footer to the position of the body', async () => {
    const { head, body, foot } = setup()
    await nextTick()
    scroll(body.value!, 120)
    expect(head.value!.scrollLeft).toBe(120)
    expect(foot.value!.scrollLeft).toBe(120)
  })

  it('takes the body and footer with a header the focus scrolled', async () => {
    const { head, body, foot } = setup()
    await nextTick()
    scroll(head.value!, 80)
    expect(body.value!.scrollLeft).toBe(80)
    expect(foot.value!.scrollLeft).toBe(80)
  })

  it('does not take its own write for a scroll of the user', async () => {
    const { head, body } = setup()
    await nextTick()
    scroll(body.value!, 120)
    // The header's event for the position the table wrote: had it been
    // taken for the user's, the body would go back to 120.
    body.value!.scrollLeft = 300
    head.value!.dispatchEvent(new Event('scroll'))
    expect(body.value!.scrollLeft).toBe(300)
    body.value!.dispatchEvent(new Event('scroll'))
    expect(head.value!.scrollLeft).toBe(300)
    // A vertical scroll of the body writes nothing sideways.
    const before = writes.get(head.value!)
    body.value!.dispatchEvent(new Event('scroll'))
    expect(writes.get(head.value!)).toBe(before)
  })

  it('starts a footer drawn later where the body is', async () => {
    const { body, foot } = setup()
    await nextTick()
    scroll(body.value!, 60)
    foot.value = box()
    await nextTick()
    expect(foot.value.scrollLeft).toBe(60)
  })

  it('listens to nothing while off, and stops on unmount', async () => {
    const { enabled, head, body, wrapper } = setup()
    enabled.value = false
    await nextTick()
    scroll(body.value!, 50)
    expect(head.value!.scrollLeft).toBe(0)
    enabled.value = true
    await nextTick()
    scroll(body.value!, 70)
    expect(head.value!.scrollLeft).toBe(70)
    const removed = vi.spyOn(body.value!, 'removeEventListener')
    wrapper.unmount()
    mounted.splice(0)
    expect(removed).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('warns once when the header cannot follow the body to the right end', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { head, body } = setup({ headMax: 100 })
    await nextTick()
    scroll(body.value!, 110)
    expect(head.value!.scrollLeft).toBe(100)
    scroll(body.value!, 0)
    scroll(body.value!, 120)
    // The header follows back from its clamped position: no echo to the body.
    expect(body.value!.scrollLeft).toBe(120)
    expect(
      warn.mock.calls.filter(call =>
        String(call[0]).includes('cannot scroll sideways as far')
      )
    ).toHaveLength(1)
  })

  it('warns once when the body table has the automatic layout', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { foot } = setup({ layout: 'auto' })
    await nextTick()
    foot.value = box()
    await nextTick()
    expect(
      warn.mock.calls.filter(call => String(call[0]).includes('table-layout'))
    ).toHaveLength(1)
  })

  it('does not warn with the fixed layout', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setup()
    await nextTick()
    expect(warn).not.toHaveBeenCalled()
  })
})
