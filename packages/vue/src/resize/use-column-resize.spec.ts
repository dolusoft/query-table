import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import type { Column, ColumnResizePayload } from '../contract'
import type * as Measure from './measure-widths'
import { useColumnResize } from './use-column-resize'

// The measure needs a real layout; the browser tests (measure-widths and
// auto-width browser specs) check it. Here it is a stub, so the call autofit
// makes is checked alone.
const calls = vi.hoisted((): { fields: string[]; options: unknown }[] => [])
vi.mock('./measure-widths', async importOriginal => ({
  ...(await importOriginal<typeof Measure>()),
  measureColumnWidths: (
    _table: unknown,
    fields: string[],
    _body: unknown,
    options?: unknown
  ) => {
    calls.push({ fields, options })
    return { id: 120 }
  }
}))

/** Double clicks the handle of `column`; what was emitted. */
const autofit = (column: Column) => {
  const emitted: ColumnResizePayload[] = []
  let api!: ReturnType<typeof useColumnResize>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useColumnResize({
          resizable: () => true,
          measuredWidth: () => 60,
          tableWidth: () => 600,
          body: () => null,
          emit: payload => emitted.push(payload)
        })
        return () => h('div')
      }
    })
  )
  const table = document.createElement('table')
  const th = document.createElement('th')
  const handle = document.createElement('div')
  th.append(handle)
  table.createTHead().insertRow().append(th)
  document.body.append(table)
  const on = api.listeners(() => column)
  handle.addEventListener('dblclick', on.dblclick)
  handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  wrapper.unmount()
  table.remove()
  return emitted
}

describe('C-50 autofit', () => {
  it('measures with the filter row as a floor, as autoWidth does (C-100)', () => {
    calls.length = 0
    expect(autofit({ field: 'id', title: 'ID' })).toEqual([
      { field: 'id', width: 120 }
    ])
    expect(calls).toEqual([{ fields: ['id'], options: { filters: true } }])
  })

  it('lets a maxWidth below the filter floor win', () => {
    // The stub's 120 includes the floor.
    expect(autofit({ field: 'id', title: 'ID', maxWidth: 80 })).toEqual([
      { field: 'id', width: 80 }
    ])
  })
})
