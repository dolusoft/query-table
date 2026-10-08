// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick, ref, type Component } from 'vue'
import QueryTable from './query-table.vue'

const Table = QueryTable as unknown as Component

describe('expand with disruptive cell slot', () => {
  it('still mounts subtable when a cell slot rewrites rows mid-render', async () => {
    const rows = ref([{ name: 'a' }, { name: 'b' }])
    const wrapper = mount({
      components: { QueryTable: Table },
      setup() {
        const bump = () => {
          // New array identity during the same render pass that paints the open row.
          rows.value = rows.value.map(r => ({ ...r }))
        }
        return { rows, bump }
      },
      template: `
        <QueryTable
          :query="{ page: 1, pageSize: 10, sort: null, filters: [] }"
          :columns="[{ field: 'name', title: 'Name' }]"
          :rows="rows"
          :total-rows="2"
          :has-subtable="true"
          row-key="name"
        >
          <template #cell-name="{ row }">
            <span class="cell" @vue:mounted="bump">{{ row.name }}</span>
          </template>
          <template #subtable><div class="sub">open</div></template>
        </QueryTable>
      `
    })
    await nextTick()
    await wrapper.findAll('.qt-expand')[0].trigger('click')
    await nextTick()
    await nextTick()
    expect(wrapper.find('tr[data-expanded]').exists()).toBe(true)
    expect(wrapper.find('tr.qt-subtable-row').exists()).toBe(true)
    expect(wrapper.find('.sub').exists()).toBe(true)
  })
})
