// A live change in a large table (#266): `rows` swaps between two arrays that
// differ in one row, the watchers run, and the table reads what a render
// reads: the drawn rows and the header checkbox. Nothing is selected, pinned
// or open, the state of most live tables.
import { describe, expect, test } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'

import type { Column, TableQuery } from '../src/contract'
import { useQueryTable } from '../src/use-query-table'

interface Row {
  id: number
  name: string
  isExpanded?: boolean
}

const columns: Column[] = [{ field: 'id', type: 'integer' }, { field: 'name' }]
const query: TableQuery = { page: 1, pageSize: 50, sort: null, filters: [] }

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `row ${String(index + 1)}`
  }))

/** Two arrays that differ in the row in the middle: a live update. */
const pair = (count: number): [Row[], Row[]] => {
  const first = makeRows(count)
  const second = [...first]
  const middle = Math.floor(count / 2)
  second[middle] = { ...first[middle], name: 'changed' }
  return [first, second]
}

const options = {
  time: 1000,
  iterations: 32,
  warmupTime: 250,
  warmupIterations: 8
}

for (const count of [20_000, 100_000]) {
  describe(`${String(count)} rows`, () => {
    test('selection and row pinning on, nothing selected or pinned', async ({
      annotate,
      bench
    }) => {
      const [first, second] = pair(count)
      const rows = shallowRef(first)
      const scope = effectScope()
      const state = scope.run(() =>
        useQueryTable<Row>({
          query,
          columns,
          rows,
          rowKey: 'id',
          selection: {},
          rowPinning: { top: [], bottom: [] },
          onQueryChange: () => {}
        })
      )!
      try {
        const run = await bench('rows change', async () => {
          rows.value = rows.value === first ? second : first
          await nextTick()
          return [
            state.rowPinning.rows.value.length,
            state.selection.allSelected.value,
            state.selection.someSelected.value
          ]
        }).run(options)
        await annotate(
          `median ${run.latency.p50.toFixed(3)} ms; ${String(run.latency.samplesCount)} samples`
        )
        expect(state.rowPinning.rows.value).toHaveLength(count)
        expect(state.selection.allSelected.value).toBe(false)
      } finally {
        scope.stop()
      }
    })

    test('subtable on, no row open', async ({ annotate, bench }) => {
      const [first, second] = pair(count)
      const rows = shallowRef(first)
      const scope = effectScope()
      const state = scope.run(() =>
        useQueryTable<Row>({
          query,
          columns,
          rows,
          rowKey: 'id',
          hasSubtable: true,
          onQueryChange: () => {}
        })
      )!
      try {
        const run = await bench('rows change', async () => {
          rows.value = rows.value === first ? second : first
          await nextTick()
          return state.rowPinning.rows.value.length
        }).run(options)
        await annotate(
          `median ${run.latency.p50.toFixed(3)} ms; ${String(run.latency.samplesCount)} samples`
        )
        expect(state.rowPinning.rows.value).toHaveLength(count)
        expect(state.table.atoms.expanded.get()).toEqual({})
      } finally {
        scope.stop()
      }
    })

    test('no subtable: isExpanded over every row (a virtual body)', async ({
      annotate,
      bench
    }) => {
      const [first, second] = pair(count)
      const rows = shallowRef(first)
      const scope = effectScope()
      const state = scope.run(() =>
        useQueryTable<Row>({
          query,
          columns,
          rows,
          rowKey: 'id',
          onQueryChange: () => {}
        })
      )!
      try {
        const run = await bench('rows change', async () => {
          rows.value = rows.value === first ? second : first
          await nextTick()
          let open = 0
          rows.value.forEach((row, index) => {
            open += state.expansion.isExpanded(row, index) ? 1 : 0
          })
          return open
        }).run(options)
        await annotate(
          `median ${run.latency.p50.toFixed(3)} ms; ${String(run.latency.samplesCount)} samples`
        )
        expect(
          rows.value.some((row, index) =>
            state.expansion.isExpanded(row, index)
          )
        ).toBe(false)
      } finally {
        scope.stop()
      }
    })
  })
}
