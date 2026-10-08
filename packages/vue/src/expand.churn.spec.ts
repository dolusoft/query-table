// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { computed, nextTick, ref, type Component } from 'vue'
import QueryTable from './query-table.vue'

const Table = QueryTable as unknown as Component

describe('expand churn', () => {
  it('keeps open after parent reassigns equal rows array', async () => {
    const rows = ref([{ app: 'SSL' }, { app: 'QUIC' }])
    const reportRowKey = computed(() => {
      const values = rows.value.map(r => r.app)
      const unique = new Set(values).size === values.length
      return (row: { app: string }, index: number) => (unique ? row.app : String(index))
    })
    const wrapper = mount({
      components: { QueryTable: Table },
      setup() {
        return { rows, reportRowKey }
      },
      template: `
        <QueryTable
          :query="{ page: 1, pageSize: 10, sort: null, filters: [] }"
          :columns="[{ field: 'app', title: 'App' }]"
          :rows="rows"
          :total-rows="2"
          :has-subtable="true"
          :row-key="reportRowKey"
        >
          <template #subtable><div class="sub">open</div></template>
        </QueryTable>
      `
    })
    await nextTick()
    await wrapper.findAll('.qt-expand')[0].trigger('click')
    await nextTick()
    expect(wrapper.find('.sub').exists()).toBe(true)

    // Simulate parent recomputing rows with new array identity (same content)
    rows.value = rows.value.map(r => ({ ...r }))
    await nextTick()
    await nextTick()
    expect(wrapper.find('.sub').exists()).toBe(true)
  })

  it('survives rowKey function identity change', async () => {
    const rows = ref([{ app: 'SSL' }, { app: 'QUIC' }])
    const tick = ref(0)
    const reportRowKey = computed(() => {
      tick.value // force new function each tick
      return (row: { app: string }) => row.app
    })
    const wrapper = mount({
      components: { QueryTable: Table },
      setup() {
        return { rows, reportRowKey, bump: () => { tick.value++ } }
      },
      template: `
        <QueryTable
          :query="{ page: 1, pageSize: 10, sort: null, filters: [] }"
          :columns="[{ field: 'app', title: 'App' }]"
          :rows="rows"
          :total-rows="2"
          :has-subtable="true"
          :row-key="reportRowKey"
        >
          <template #subtable><div class="sub">open</div></template>
        </QueryTable>
      `
    })
    await nextTick()
    await wrapper.findAll('.qt-expand')[0].trigger('click')
    await nextTick()
    expect(wrapper.find('.sub').exists()).toBe(true)
    ;(wrapper.vm as any).bump()
    await nextTick()
    expect(wrapper.find('.sub').exists()).toBe(true)
  })
})
