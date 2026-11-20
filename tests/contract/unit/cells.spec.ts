import {
  CellAction,
  CellActions,
  CellBadge,
  CellCopy,
  CellPreview,
  CellStack,
  CellValue
} from '@dolusoft/query-table/cells'
import { DataTable } from '@dolusoft/query-table/data-table'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type Component } from 'vue'

import QueryTable, {
  type Column,
  type TableLabels
} from '@dolusoft/query-table'

let wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  wrappers = []
})

const render = (component: Component, props = {}, slots = {}) => {
  const wrapper = mount(component, { props, slots }) as VueWrapper
  wrappers.push(wrapper)
  return wrapper
}

describe('C-128 Cell components: markup and DOM', () => {
  it('CellStack draws a primary line and a secondary one only when given', () => {
    const both = render(CellStack, { primary: 'AnaOfis', secondary: 'test' })
    expect(both.html()).toBe(
      '<span class="qt-cell-stack"><span class="qt-cell-primary">AnaOfis</span><span class="qt-cell-secondary">test</span></span>'
    )
    for (const secondary of [undefined, null, '']) {
      const one = render(CellStack, { primary: 60, secondary })
      expect(one.find('.qt-cell-secondary').exists()).toBe(false)
      expect(one.find('.qt-cell-primary').text()).toBe('60')
    }
    const slotted = render(
      CellStack,
      {},
      { primary: () => h('b', 'P'), secondary: () => h('i', 'S') }
    )
    expect(slotted.find('.qt-cell-primary').html()).toContain('<b>P</b>')
    expect(slotted.find('.qt-cell-secondary').html()).toContain('<i>S</i>')
  })

  it('CellCopy draws the value in a code and a typed button with an icon', () => {
    const copy = render(CellCopy, { value: 'eeba5a76' })
    const root = copy.find('span.qt-cell-copy')
    expect(root.find('code.qt-cell-copy-text').text()).toBe('eeba5a76')
    const button = root.find('button.qt-cell-copy-button')
    expect(button.attributes('type')).toBe('button')
    expect(button.find('svg.qt-cell-icon').attributes('aria-hidden')).toBe(
      'true'
    )
  })

  it('CellPreview draws the text and a typed button with an icon', () => {
    const preview = render(CellPreview, { text: 'Default Template' })
    const root = preview.find('span.qt-cell-preview')
    expect(root.find('span.qt-cell-preview-text').text()).toBe(
      'Default Template'
    )
    const button = root.find('button.qt-cell-preview-button')
    expect(button.attributes('type')).toBe('button')
    expect(button.find('svg.qt-cell-icon').exists()).toBe(true)
  })

  it('CellBadge carries its tone, neutral by default', () => {
    expect(render(CellBadge, { text: 'Aktif' }).html()).toBe(
      '<span class="qt-cell-badge" data-tone="neutral">Aktif</span>'
    )
    const warning = render(
      CellBadge,
      { tone: 'warning' },
      { default: () => 'Desteklenmiyor' }
    )
    expect(warning.attributes('data-tone')).toBe('warning')
    expect(warning.text()).toBe('Desteklenmiyor')
  })

  it('CellValue draws the value as a cell does, or the empty label', () => {
    expect(render(CellValue, { value: 'seed-146' }).text()).toBe('seed-146')
    expect(render(CellValue, { value: 0 }).text()).toBe('0')
    expect(render(CellValue, { value: false }).text()).toBe('false')
    const markup = render(CellValue, { value: '<b>x</b>' })
    expect(markup.find('b').exists()).toBe(false)
    expect(markup.text()).toBe('<b>x</b>')
    for (const value of [null, undefined, '']) {
      expect(render(CellValue, { value }).html()).toBe(
        '<span class="qt-cell-empty">-</span>'
      )
    }
  })

  it('CellActions groups CellAction buttons that pass attributes and listeners on', async () => {
    const onClick = vi.fn()
    const actions = render(
      CellActions,
      {},
      {
        default: () => [
          h(CellAction, { kind: 'primary', onClick }, () => 'Düzenle'),
          h(
            CellAction,
            { 'aria-label': 'AnaOfis sil', disabled: true },
            () => 'Sil'
          ),
          h(CellAction, {}, () => 'Aç')
        ]
      }
    )
    const buttons = actions.findAll(
      'span.qt-cell-actions > button.qt-cell-action'
    )
    expect(buttons.map(button => button.attributes('data-kind'))).toEqual([
      'primary',
      'default',
      'default'
    ])
    expect(
      buttons.every(button => button.attributes('type') === 'button')
    ).toBe(true)
    expect(buttons[1].attributes('aria-label')).toBe('AnaOfis sil')
    expect(buttons[1].attributes('disabled')).toBeDefined()
    await buttons[0].trigger('click')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('writes no inline style', () => {
    const all = [
      render(CellStack, { primary: 'a', secondary: 'b' }),
      render(CellCopy, { value: 'a' }),
      render(CellPreview, { text: 'a' }),
      render(CellBadge, { text: 'a' }),
      render(CellValue, { value: null }),
      render(CellActions, {}, { default: () => h(CellAction, () => 'a') })
    ]
    for (const wrapper of all) {
      expect(wrapper.html()).not.toContain('style=')
    }
  })

  it('CellValue takes no attributes, empty or not, and warns about none', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const empty = render(CellValue, { value: null, class: 'mono', id: 'x' })
    expect(empty.html()).toBe('<span class="qt-cell-empty">-</span>')
    const full = render(CellValue, { value: 'seed', class: 'mono', id: 'x' })
    expect(full.text()).toBe('seed')
    expect(full.html()).not.toContain('mono')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('C-129 Cell components: events and labels', () => {
  it('emits copy and preview with the value as a string, and lets the click bubble', async () => {
    const onClick = vi.fn()
    const copied = vi.fn()
    const previewed = vi.fn()
    const again = render({
      render: () =>
        h('div', { onClick }, [
          h(CellCopy, { value: 42, onCopy: copied }),
          h(CellPreview, { text: 'Default Template', onPreview: previewed })
        ])
    })
    await again.find('.qt-cell-copy-button').trigger('click')
    await again.find('.qt-cell-preview-button').trigger('click')
    expect(copied).toHaveBeenCalledWith('42')
    expect(previewed).toHaveBeenCalledWith('Default Template')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('uses the English defaults outside a table', () => {
    const copy = render(CellCopy, { value: 'abc' })
    const button = copy.find('.qt-cell-copy-button')
    expect(button.attributes('aria-label')).toBe('Copy abc')
    expect(button.attributes('title')).toBe('Copy abc')
    expect(
      render(CellPreview, { text: 'x' })
        .find('.qt-cell-preview-button')
        .attributes('aria-label')
    ).toBe('Preview x')
    expect(render(CellValue, { value: null }).text()).toBe('-')
  })

  const columns: Column[] = [
    { field: 'id', type: 'integer' },
    { field: 'name' }
  ]
  const rows = [{ id: 1, name: 'AnaOfis' }]
  const turkish: Partial<TableLabels> = {
    copyValue: value => `${value} kopyala`,
    previewValue: text => `${text} önizle`,
    emptyValue: '—'
  }
  const cellSlots = {
    'cell-id': ({ row }: { row: { id: number } }) =>
      h(CellCopy, { value: row.id }),
    'cell-name': ({ row }: { row: { name: string } }) => [
      h(CellPreview, { text: row.name }),
      h(CellValue, { value: null })
    ]
  }

  it.each([
    [
      'QueryTable',
      QueryTable,
      {
        totalRows: 1,
        query: { page: 1, pageSize: 10, sort: null, filters: [] }
      }
    ],
    ['DataTable', DataTable, { rowKey: 'id' }]
  ] as const)(
    'reads the labels of the %s it sits in and follows them',
    async (_, table, extra) => {
      const wrapper = render(
        table,
        { columns, rows, labels: turkish, ...extra },
        cellSlots
      )
      const copy = () => wrapper.find('.qt-cell-copy-button')
      expect(copy().attributes('aria-label')).toBe('1 kopyala')
      expect(wrapper.find('.qt-cell-preview-button').attributes('title')).toBe(
        'AnaOfis önizle'
      )
      expect(wrapper.find('.qt-cell-empty').text()).toBe('—')
      await wrapper.setProps({
        labels: { copyValue: (v: string) => `Copy #${v}` }
      })
      await nextTick()
      expect(copy().attributes('aria-label')).toBe('Copy #1')
      expect(wrapper.find('.qt-cell-empty').text()).toBe('-')
    }
  )

  it('takes an entry given as undefined for left out', () => {
    const wrapper = render(
      QueryTable,
      {
        columns,
        rows,
        totalRows: 1,
        query: { page: 1, pageSize: 10, sort: null, filters: [] },
        labels: {
          copyValue: undefined,
          previewValue: undefined,
          emptyValue: undefined
        }
      },
      cellSlots
    )
    expect(wrapper.find('.qt-cell-copy-button').attributes('aria-label')).toBe(
      'Copy 1'
    )
    expect(
      wrapper.find('.qt-cell-preview-button').attributes('aria-label')
    ).toBe('Preview AnaOfis')
    expect(wrapper.find('.qt-cell-empty').text()).toBe('-')
  })
})
