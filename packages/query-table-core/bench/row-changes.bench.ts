// The cost of one tracker update on 10K rows (K11 of ADR 0011). Not a CI
// gate: run with `pnpm build && pnpm bench`; the numbers go into the pull
// request. Target: one changed row on 10K rows, median < 1 ms.
//
// It measures the built entry, the code that ships (see the protocol's
// apply-query bench for why).

import { describe, expect, test } from 'vitest'

import type * as RowChanges from '../src/row-changes'

const entry = '../dist/row-changes.js'
const { createRowChangeTracker } = (await import(
  /* @vite-ignore */ entry
)) as typeof RowChanges

type Kind = 'primitive' | 'date' | 'nested'
type Row = Record<string, unknown> & { id: number }

const valueOf = (kind: Kind, n: number): unknown =>
  kind === 'primitive'
    ? n
    : kind === 'date'
      ? new Date(1_700_000_000_000 + n)
      : { at: new Date(1_700_000_000_000 + n), tags: [n, n + 1] }

const rowsOf = (count: number, fields: string[], kind: Kind, salt = 0) =>
  Array.from({ length: count }, (_, id): Row => {
    const row: Row = { id }
    fields.forEach((field, i) => {
      row[field] = valueOf(kind, id * 100 + i + salt)
    })
    return row
  })

const query = { page: 1, pageSize: 10_000, sort: null, filters: [] }

/** The next rows for each change scenario, given the base rows. */
const changes: Record<
  string,
  (base: Row[], fields: string[], kind: Kind) => Row[]
> = {
  'one row': base => {
    const next = base.slice()
    next[5000] = { ...next[5000], id: 5000, f0: -1 }
    return next
  },
  '1% of rows': base =>
    base.map((row, i) => (i % 100 === 0 ? { ...row, f0: -i } : row)),
  'every row': base => base.map((row, i) => ({ ...row, f0: -i - 1 })),
  'new objects, same values': (_base, fields, kind) =>
    rowsOf(10_000, fields, kind)
}

for (const fieldCount of [10, 50]) {
  const fields = Array.from({ length: fieldCount }, (_, i) => `f${String(i)}`)
  for (const kind of ['primitive', 'date', 'nested'] as const) {
    describe(`10K rows, ${String(fieldCount)} fields, ${kind}`, () => {
      const base = rowsOf(10_000, fields, kind)
      for (const [name, make] of Object.entries(changes)) {
        const next = make(base, fields, kind)
        test(name, async ({ annotate, bench }) => {
          const tracker = createRowChangeTracker<Row>(row => row.id)
          const input = {
            query,
            loading: false,
            fields,
            hint: 'live' as const,
            quiet: false
          }
          let flip = false
          tracker.update({ ...input, rows: base })
          expect(tracker.update({ ...input, rows: next }).reset).toBe(false)
          const run = await bench(name, () => {
            flip = !flip
            tracker.update({ ...input, rows: flip ? base : next })
          }).run()
          await annotate(`median ${run.latency.p50.toFixed(3)} ms`)
        })
      }
    })
  }
}
