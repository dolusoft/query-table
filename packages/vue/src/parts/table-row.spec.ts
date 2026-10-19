// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import {
  defineComponent,
  h,
  nextTick,
  ref,
  type Component,
  type ComponentPublicInstance,
  type VNode
} from 'vue'

import type { Column } from '../contract'
import QueryTable from '../query-table.vue'
import TableBody from './table-body.vue'
import { tableRow } from './table-row'

// The row component's structure (ADR 0017, K311-1, K311-2, K311-6, K311-7):
// what makes Vue skip a row whose values did not change. The behavior is
// tested in the browser (row-render.browser.spec.ts) and by the render
// budget; this spec locks the vnodes and the values the skip depends on.

const Table = QueryTable as unknown as Component

interface Row {
  id: number
  name: string
  age: number
}

const columns: Column[] = [
  { field: 'id', title: 'ID', type: 'number', pinned: 'left' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'number' }
]

const makeRows = (count = 6): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Name ${i + 1}`,
    age: 20 + i
  }))

const query = { page: 1, pageSize: 50, sort: null, filters: [] }

// Counts the updates and mounts of `TableRow`, as the render budget does.
const counts = { updates: 0, mounts: 0 }
const counter = {
  mounted(this: ComponentPublicInstance) {
    if (this.$options.name === 'TableRow') {
      counts.mounts++
    }
  },
  updated(this: ComponentPublicInstance) {
    if (this.$options.name === 'TableRow') {
      counts.updates++
    }
  }
}
const resetCounts = () => {
  counts.updates = 0
  counts.mounts = 0
}

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  resetCounts()
})

const mountTable = (
  props: Record<string, unknown> = {},
  slots: Record<string, unknown> = {}
) => {
  wrapper = mount(Table, {
    props: {
      columns,
      rows: makeRows(),
      totalRows: 6,
      query,
      rowKey: 'id',
      ...props
    },
    slots,
    attachTo: document.body,
    global: { mixins: [counter] }
  }) as VueWrapper
  return wrapper
}

const rowWrappers = (w: VueWrapper) => w.findAllComponents(tableRow)

/** The vnodes of `TableRow` in the body's last render. */
const rowVNodes = (w: VueWrapper) => {
  const found: VNode[] = []
  const walk = (node: VNode) => {
    if (node.type === tableRow) {
      found.push(node)
      return
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child as VNode)
      }
    }
  }
  // The body is generic: its instance type is not inferred.
  walk((w.findComponent(TableBody).vm as ComponentPublicInstance).$.subTree)
  return found
}

const PROPS = 8
const FULL_PROPS = 16
const DYNAMIC_SLOTS = 1024

describe('TableRow structure (ADR 0017)', () => {
  it('every row vnode is one Vue can skip: no children, no dynamic slots, no directives, compared props', async () => {
    const w = mountTable(
      {
        hasSubtable: true,
        hasRightPanel: true,
        selection: {},
        flash: true,
        rowKind: (row: Row) => (row.id % 2 ? 'odd' : null)
      },
      {
        'cell-name': '<b>{{ params.row.name }}</b>',
        subtable: '<i>detail</i>'
      }
    )
    await w.findAll('.qt-expand')[1].trigger('click')
    await nextTick()
    const vnodes = rowVNodes(w)
    expect(vnodes).toHaveLength(6)
    for (const vnode of vnodes) {
      expect(vnode.children).toBeNull()
      expect(vnode.patchFlag & DYNAMIC_SLOTS).toBe(0)
      expect(vnode.dirs).toBeNull()
      expect(vnode.patchFlag & (PROPS | FULL_PROPS)).not.toBe(0)
    }
    // The row's subtree is one `tr` element vnode, a direct child of the
    // body (the virtual window and the context menu find it there).
    for (const row of rowWrappers(w)) {
      const subTree = row.vm.$.subTree
      expect(subTree.type).toBe('tr')
      expect((row.element as HTMLElement).parentElement?.tagName).toBe('TBODY')
    }
    expect(w.find('tr.qt-subtable-row').exists()).toBe(true)
  })

  it('keeps cells and utilities by identity across an update of rows only', async () => {
    const w = mountTable(
      { hasSubtable: true, selection: {} },
      { 'cell-name': '<b>{{ params.row.name }}</b>' }
    )
    // The pin offsets are measured after the mount.
    await nextTick()
    await nextTick()
    // The body and the table are generic: their props are not inferred.
    const body = w.findComponent(TableBody)
    const entriesOf = () => (body.props() as { entries: unknown[] }).entries
    const entries = entriesOf()
    const first = rowWrappers(w)[0]
    const cells = first.props('cells')
    const utilities = first.props('utilities')
    resetCounts()

    const rows = (w.props() as { rows: Row[] }).rows.map(row =>
      row.id === 3 ? { ...row } : row
    )
    await w.setProps({ rows })

    // `entries` is a new array after a change of `rows` (K311-2): the cells
    // must not follow it.
    expect(entriesOf()).not.toBe(entries)
    for (const row of rowWrappers(w)) {
      expect(row.props('cells')).toBe(cells)
      expect(row.props('utilities')).toBe(utilities)
    }
    expect(counts).toEqual({ updates: 1, mounts: 0 })
  })

  it('draws every row again when the set of cell slots changes', async () => {
    const Host = defineComponent({
      setup() {
        const withSlot = ref(false)
        return { withSlot }
      },
      render() {
        return h(
          Table,
          { columns, rows: rows6, totalRows: 6, query, rowKey: 'id' },
          this.withSlot
            ? { 'cell-age': () => h('b', { class: 'slotted' }, 'x') }
            : {}
        )
      }
    })
    const rows6 = makeRows()
    wrapper = mount(Host, {
      attachTo: document.body,
      global: { mixins: [counter] }
    })
    resetCounts()
    ;(wrapper.vm as unknown as { withSlot: boolean }).withSlot = true
    await nextTick()
    expect(wrapper.findAll('b.slotted')).toHaveLength(6)
    expect(counts).toEqual({ updates: 6, mounts: 0 })
  })

  it('binds a flash without a reactive read: a row mounted under a flash is not drawn again by a new array of the same rows', async () => {
    const w = mountTable({
      flash: true,
      rowsUpdate: 'live',
      style: '--qt-flash-duration: 60000ms'
    })
    let rows = [{ id: 100, name: 'New', age: 1 }, ...makeRows()]
    await w.setProps({ rows })
    rows = [
      { id: 101, name: 'Newer', age: 2 },
      ...rows.map(row => (row.id === 2 ? { ...row, age: 99 } : row))
    ]
    await w.setProps({ rows })
    // Rows mounted while marks are live: `bind` ran in their mount.
    expect(w.findAll('tbody tr[data-flash]').length).toBeGreaterThan(0)
    resetCounts()

    await w.setProps({ rows: [...rows] })
    await nextTick()
    expect(counts).toEqual({ updates: 0, mounts: 0 })
  })
})

describe('TableRow and the expansion snapshot (K311-7)', () => {
  it('mounts the subtable when a cell slot writes reactive state once while it is evaluated', async () => {
    const rows = ref([{ name: 'a' }, { name: 'b' }])
    let wrote = false
    wrapper = mount(
      defineComponent({
        components: { QueryTable: Table },
        setup() {
          // Written once, synchronously, inside the slot's evaluation.
          const touch = (name: string) => {
            if (!wrote && name === 'a') {
              wrote = true
              rows.value = rows.value.map(row => ({ ...row }))
            }
            return name
          }
          return { rows, touch }
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
              <span class="cell">{{ touch(row.name) }}</span>
            </template>
            <template #subtable><div class="sub">open</div></template>
          </QueryTable>
        `
      }),
      { attachTo: document.body }
    )
    await nextTick()
    wrote = false
    await wrapper.findAll('.qt-expand')[0].trigger('click')
    await nextTick()
    await nextTick()
    expect(wrote).toBe(true)
    expect(
      wrapper.find('tr[data-row-index="0"]').attributes('data-expanded')
    ).toBe('')
    expect(wrapper.find('.qt-expand').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('tr.qt-subtable-row').exists()).toBe(true)
    expect(wrapper.find('.sub').exists()).toBe(true)
  })
})
