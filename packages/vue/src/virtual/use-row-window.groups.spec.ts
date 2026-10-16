import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import type { VirtualOptions } from '../contract'
import type { BodyRow } from '../use-query-table'
import { useRowWindow, type BodyItem } from './use-row-window'

// C-103 to C-105 in the window itself, without a layout: the drawn list,
// the group row identities and counts, printing, and grouping off.

interface Row {
  id: number
  cat: string | null
}

const list = (cats: Array<string | null>, from = 0): BodyRow<Row>[] =>
  cats.map((cat, i) => ({
    row: { id: from + i, cat },
    index: i,
    pinned: false
  }))

const setup = (options: {
  virtual?: boolean | VirtualOptions
  rows: BodyRow<Row>[]
  groupBy?: ((row: Row) => string | null) | undefined
}) => {
  const rows = shallowRef(options.rows)
  const virtual = shallowRef<boolean | VirtualOptions | undefined>(
    options.virtual
  )
  const groupBy = shallowRef(
    'groupBy' in options ? options.groupBy : (row: Row) => row.cat
  )
  let api: ReturnType<typeof useRowWindow<Row>> | null = null
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useRowWindow<Row>({
          virtual: () => virtual.value,
          table: shallowRef(null),
          bodyRows: () => rows.value,
          keyOf: row => row.id,
          isExpanded: () => false,
          groupBy: () => groupBy.value
        })
        return () => h('div')
      }
    })
  )
  return { api: api!, rows, virtual, groupBy, wrapper }
}

const shape = (items: Array<BodyItem<Row>>) =>
  items.map(item =>
    'spacer' in item
      ? `spacer`
      : 'group' in item
        ? `group:${String(item.group.key)}${item.aria === undefined ? '' : `@${item.aria}`}`
        : `${item.row.id}${item.aria === undefined ? '' : `@${item.aria}`}`
  )

describe('C-103 use-row-window without virtual', () => {
  it('draws a group row above the first row of each run', () => {
    const { api } = setup({ rows: list(['a', 'a', null, 'b']) })
    expect(shape(api.drawn.value)).toEqual([
      'group:a',
      '0',
      '1',
      '2',
      'group:b',
      '3'
    ])
    expect(api.groupCount()).toBe(2)
  })

  it('draws no group row for pinned rows', () => {
    const rows: BodyRow<Row>[] = [
      { row: { id: 9, cat: 'a' }, index: 9, pinned: 'top' },
      ...list(['a', 'a']),
      { row: { id: 8, cat: 'a' }, index: 8, pinned: 'bottom' }
    ]
    const { api } = setup({ rows })
    expect(shape(api.drawn.value)).toEqual(['9', 'group:a', '0', '1', '8'])
  })

  it('draws the rows as given without groupBy', () => {
    const rows = list(['a', 'b'])
    const { api } = setup({ rows, groupBy: undefined })
    expect(api.drawn.value).toBe(rows)
    expect(api.groupCount()).toBe(0)
  })
})

describe('C-104 use-row-window with virtual', () => {
  it('counts the group rows in the aria indexes, each before its first row', () => {
    const { api } = setup({
      virtual: { rowHeight: 20 },
      rows: list(['a', 'a', 'b', null, 'c'])
    })
    expect(shape(api.drawn.value)).toEqual([
      'group:a@2',
      '0@3',
      '1@4',
      'group:b@5',
      '2@6',
      '3@7',
      'group:c@8',
      '4@9'
    ])
  })

  it('keeps the same key for a group row when the rows are new objects', async () => {
    const { api, rows } = setup({
      virtual: { rowHeight: 20 },
      rows: list(['a', 'a', 'b'])
    })
    const keys = () =>
      api.drawn.value.flatMap(item => ('group' in item ? [item.key] : []))
    const before = keys()
    expect(before.every(key => typeof key === 'symbol')).toBe(true)
    rows.value = list(['a', 'a', 'b']).map(row => ({
      ...row,
      row: { ...row.row }
    }))
    await nextTick()
    expect(keys()).toEqual(before)
    // A group that leaves and comes back gets a new identity.
    rows.value = list(['b'])
    await nextTick()
    rows.value = list(['a', 'b'])
    await nextTick()
    expect(keys()[0]).not.toBe(before[0])
    expect(keys()[1]).toBe(before[1])
  })

  it('draws every group row in its place while the page prints', async () => {
    const { api, wrapper } = setup({
      virtual: { rowHeight: 20 },
      rows: list(
        Array.from({ length: 200 }, (_, i) => `g${Math.floor(i / 50)}`)
      )
    })
    expect(api.drawn.value.length).toBeLessThan(200)
    dispatchEvent(new Event('beforeprint'))
    await nextTick()
    const groups = api.drawn.value.filter(item => 'group' in item)
    expect(groups).toHaveLength(4)
    expect(api.drawn.value.filter(item => 'spacer' in item)).toHaveLength(0)
    dispatchEvent(new Event('afterprint'))
    await nextTick()
    expect(api.drawn.value.length).toBeLessThan(200)
    wrapper.unmount()
  })

  it('a new groupBy with the same runs draws the body again but rebuilds no height', async () => {
    const { api, groupBy } = setup({
      virtual: { rowHeight: 20, groupRowHeight: 30 },
      rows: list(['a', 'a', 'b'])
    })
    expect(api.groupCount()).toBe(2)
    groupBy.value = (row: Row) => row.cat
    await nextTick()
    expect(api.groupCount()).toBe(2)
    groupBy.value = undefined
    await nextTick()
    expect(shape(api.drawn.value)).toEqual(['0@2', '1@3', '2@4'])
    expect(api.groupCount()).toBe(0)
  })

  it('turning virtual off keeps the group rows, without aria indexes', async () => {
    const { api, virtual } = setup({
      virtual: { rowHeight: 20 },
      rows: list(['a', 'b'])
    })
    virtual.value = false
    await nextTick()
    expect(shape(api.drawn.value)).toEqual(['group:a', '0', 'group:b', '1'])
  })
})

describe('C-104 use-row-window measuring group rows', () => {
  it('measures a group row apart from its row and aligns below a sticky group cell', async () => {
    const heightOf = (el: Element) =>
      el.closest('tr')?.classList.contains('qt-group-row') ? 30 : 20
    // Group rows 30px, data rows 20px: happy-dom has no layout.
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement): DOMRect {
        const height =
          this.tagName === 'TR' || this.tagName === 'TH' ? heightOf(this) : 0
        return DOMRect.fromRect({ x: 0, y: 0, width: 0, height })
      })
    try {
      const rows = shallowRef(
        list(Array.from({ length: 60 }, (_, i) => `g${Math.floor(i / 10)}`))
      )
      const table = shallowRef<HTMLTableElement | null>(null)
      const box = document.createElement('div')
      let api: ReturnType<typeof useRowWindow<Row>> | null = null
      const wrapper = mount(
        defineComponent({
          setup() {
            api = useRowWindow<Row>({
              virtual: () => ({ scrollElement: () => box }),
              table,
              bodyRows: () => rows.value,
              keyOf: row => row.id,
              isExpanded: () => false,
              groupBy: () => (row: Row) => row.cat
            })
            return () =>
              h('table', { ref: table }, [
                h(
                  'tbody',
                  api!.drawn.value.map(item =>
                    'spacer' in item
                      ? h('tr', { class: 'qt-virtual-spacer' })
                      : 'group' in item
                        ? h('tr', { class: 'qt-group-row' }, [
                            h(
                              'th',
                              { style: 'position: sticky' },
                              String(item.group.key)
                            )
                          ])
                        : h(
                            'tr',
                            { 'data-row-index': item.index },
                            String(item.row.id)
                          )
                  )
                )
              ])
          }
        }),
        { attachTo: document.body }
      )
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 50))
      api!.scrollToIndex(3, { align: 'start' })
      api!.scrollToIndex(10, { align: 'start' })
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(api!.groupCount()).toBe(6)
      expect(wrapper.findAll('tr.qt-group-row').length).toBeGreaterThan(0)
      wrapper.unmount()
    } finally {
      spy.mockRestore()
    }
  })
})
