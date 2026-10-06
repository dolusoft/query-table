// Scenario 4 measures the shipped binding. Build first, then `pnpm bench`.
import { createRequire } from 'node:module'

import { describe, expect, test } from 'vitest'
import type * as Vue from 'vue'

import type * as ProtocolLocal from '../../query-protocol/src/local'
import type { TableQuery } from '../src/contract'
import type * as VueLocal from '../src/local'

// Native Node loading keeps the built binding and evaluator in one module
// graph: Vitest's source aliases would otherwise split the dataset brand.
const require = createRequire(import.meta.url)
const { effectScope, shallowRef } = require('vue') as typeof Vue
const { defineDataset } =
  require('../../query-protocol/dist/local.js') as typeof ProtocolLocal
const { useLocalQuery } = require('../dist/local.js') as typeof VueLocal

const allRows = Array.from({ length: 10_000 }, (_, index) => ({
  id: index + 1,
  score: (index * 7919) % 10_000
}))
const dataset = defineDataset<(typeof allRows)[number]>({
  key: 'id',
  fields: { id: { type: 'integer' }, score: { type: 'integer' } }
})

describe('10000 rows', () => {
  test('(4) page-only change and rows.value read [10000 match]', async ({
    annotate,
    bench
  }) => {
    const scope = effectScope()
    const query = shallowRef<TableQuery>({
      page: 1,
      pageSize: 20,
      sort: { field: 'score', direction: 'desc' },
      filters: []
    })
    const local = scope.run(() =>
      useLocalQuery({ allRows, dataset, query, profile: 'tr-1' })
    )!
    try {
      // Prime the semantic result before measuring page-only changes.
      expect(local.rows.value).toHaveLength(20)
      expect(local.totalRows.value).toBe(10_000)
      const run = await bench('page-only change', () => {
        query.value = {
          ...query.value,
          page: query.value.page === 500 ? 1 : query.value.page + 1
        }
        return local.rows.value
      }).run({
        time: 1000,
        iterations: 64,
        warmupTime: 250,
        warmupIterations: 16
      })
      await annotate(
        `median ${run.latency.p50.toFixed(4)} ms; ${String(run.latency.samplesCount)} samples`
      )
      expect(local.error.value).toBeNull()
      expect(local.rows.value).toHaveLength(20)
    } finally {
      scope.stop()
    }
  })
})
