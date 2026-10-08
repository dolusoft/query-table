// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick, type Component } from 'vue'

import QueryTable from './query-table.vue'

const Table = QueryTable as unknown as Component

describe('expand', () => {
  it('toggles subtable on qt-expand click', async () => {
    const wrapper = mount(Table, {
      props: {
        query: { page: 1, pageSize: 10, sort: null, filters: [] },
        columns: [{ field: 'name', title: 'Name' }],
        rows: [{ name: 'a' }, { name: 'b' }],
        hasSubtable: true,
        rowKey: 'name',
        total: 2
      },
      slots: {
        subtable: '<div class="sub">open</div>'
      }
    })
    await nextTick()
    expect(wrapper.findAll('.qt-expand')).toHaveLength(2)
    expect(wrapper.find('.sub').exists()).toBe(false)
    await wrapper.findAll('.qt-expand')[0].trigger('click')
    await nextTick()
    await nextTick()
    expect(wrapper.find('tr[data-expanded]').exists()).toBe(true)
    expect(wrapper.find('.sub').exists()).toBe(true)
  })
})
