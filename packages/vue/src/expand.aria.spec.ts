// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick, type Component } from 'vue'
import QueryTable from './query-table.vue'

const Table = QueryTable as unknown as Component

describe('expand reactivity detail', () => {
  it('updates aria-expanded and chevron after click', async () => {
    const wrapper = mount(Table, {
      props: {
        query: { page: 1, pageSize: 10, sort: null, filters: [] },
        columns: [{ field: 'name', title: 'Name' }],
        rows: [{ name: 'a' }, { name: 'b' }],
        hasSubtable: true,
        rowKey: 'name',
        total: 2
      },
      slots: { subtable: '<div class="sub" style="height:200px">open</div>' },
      attachTo: document.body
    })
    await nextTick()
    const btn = wrapper.findAll('.qt-expand')[0]
    expect(btn.attributes('aria-expanded')).toBe('false')
    await btn.trigger('click')
    await nextTick()
    console.log('aria', btn.attributes('aria-expanded'))
    console.log('data-expanded on tr', wrapper.find('tr[data-row-index="0"]').attributes('data-expanded'))
    console.log('subtable tr', wrapper.find('tr.qt-subtable-row').exists())
    console.log('html', wrapper.find('tr[data-row-index="0"]').html().slice(0, 300))
    expect(btn.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('tr.qt-subtable-row').exists()).toBe(true)
  })
})
