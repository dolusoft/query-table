import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

import {
  makeQuery,
  mountTable,
  reasons,
  type Mounted
} from '../../tests/support/mount-table'
import type { HeaderSlotProps } from '../contract'

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

describe('C-51 Header slot', () => {
  const seen: HeaderSlotProps[] = []
  const slots = {
    'header-name': (props: HeaderSlotProps) => {
      seen.push(props)
      return h(
        'button',
        { type: 'button', class: 'mine', onClick: props.toggleSort },
        `${props.column.title} ${props.sortDirection ?? '-'}`
      )
    }
  }

  it('replaces the label only: the th, aria-sort, filter row and handle stay', () => {
    const m = mountIt(
      {
        sortable: true,
        filterable: true,
        resizable: true,
        query: makeQuery({ sort: { field: 'name', direction: 'asc' } })
      },
      { slots }
    )
    const th = m.wrapper.find('th[data-field="name"]')
    expect(th.find('.qt-sort').exists()).toBe(false)
    expect(th.find('.qt-title').exists()).toBe(false)
    expect(th.find('button.mine').text()).toBe('Name asc')
    expect(th.attributes('aria-sort')).toBe('ascending')
    expect(th.attributes('data-sort')).toBe('asc')
    expect(th.attributes('scope')).toBe('col')
    expect(th.find('.qt-filter').exists()).toBe(true)
    expect(th.find('.qt-resize-handle').exists()).toBe(true)
    // No nested button: the slot is not drawn inside one.
    expect(th.find('button.mine').element.parentElement).toBe(th.element)
    // Other headers keep the table's own sort button.
    expect(m.wrapper.find('th[data-field="age"] .qt-sort').exists()).toBe(true)
  })

  it('sorts through toggleSort as a header click does', async () => {
    const m = mountIt({ sortable: true }, { slots })
    await m.wrapper.find('button.mine').trigger('click')
    await m.wrapper.find('button.mine').trigger('click')
    expect(reasons(m.events)).toEqual(['sort', 'sort'])
    expect(m.events.map(([query]) => query.sort?.direction)).toEqual([
      'asc',
      'desc'
    ])
    expect(seen.at(-1)).toMatchObject({ sortable: true, sortDirection: 'desc' })
  })

  it('reports a column that cannot sort and ignores toggleSort there', async () => {
    const m = mountIt({ sortable: false }, { slots })
    await m.wrapper.find('button.mine').trigger('click')
    expect(m.events).toEqual([])
    expect(seen.at(-1)).toMatchObject({ sortable: false, sortDirection: null })
  })
})
