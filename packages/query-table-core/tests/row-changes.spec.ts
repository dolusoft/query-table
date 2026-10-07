import type { Query, TableQuery } from '@dolusoft/query-protocol'
import { describe, expect, it } from 'vitest'

import {
  createRowChangeTracker,
  type RowChangeInput,
  type RowChanges,
  type RowsUpdate
} from '../src/row-changes'

interface Row {
  id: number | string
  price?: number
  name?: string
  meta?: { at: Date }
}

const q = (over: Partial<TableQuery> = {}): TableQuery => ({
  page: 1,
  pageSize: 10,
  sort: null,
  filters: [],
  ...over
})

const fields = ['price', 'name']

/** A tracker fed step by step; each step keeps what was not given. */
const track = (first: Partial<RowChangeInput<Row>> & { rows: Row[] }) => {
  const tracker = createRowChangeTracker<Row>(row => row.id)
  let input: RowChangeInput<Row> = {
    query: q(),
    loading: false,
    fields,
    hint: undefined,
    quiet: false,
    ...first
  }
  const initial = tracker.update(input)
  return {
    initial,
    tracker,
    step(next: Partial<RowChangeInput<Row>>): RowChanges {
      input = { ...input, hint: undefined, ...next }
      return tracker.update(input)
    }
  }
}

const rows = (...items: Array<[number | string, number]>): Row[] =>
  items.map(([id, price]) => ({ id, price, name: `n${id}` }))

const nothing = (changes: RowChanges) => {
  expect(changes.added).toEqual([])
  expect([...changes.changed]).toEqual([])
}

describe('C-92 Row-change tracker [own]', () => {
  describe('baselines', () => {
    it('the first update is a baseline', () => {
      const { initial } = track({ rows: rows([1, 1]) })
      nothing(initial)
      expect(initial.reset).toBe(false)
    })

    it('the first non-empty rows after an empty start are a baseline', () => {
      const t = track({ rows: [] })
      nothing(t.step({ rows: rows([1, 1]) }))
      expect(t.step({ rows: rows([1, 2]) }).changed.get(1)).toEqual(['price'])
    })

    it('rows that arrive while loading is on are a baseline', () => {
      const t = track({ rows: rows([1, 1]) })
      nothing(t.step({ rows: rows([1, 2], [2, 0]), loading: true }))
    })

    it('clear() makes the next update a baseline', () => {
      const t = track({ rows: rows([1, 1]) })
      t.tracker.clear()
      nothing(t.step({ rows: rows([1, 2], [2, 0]) }))
    })
  })

  describe('live changes under the same query', () => {
    it('a new key is added and a changed field is changed', () => {
      const t = track({ rows: rows([1, 1], [2, 2]) })
      const changes = t.step({ rows: rows([1, 5], [2, 2], [3, 3]) })
      expect(changes.added).toEqual([3])
      expect([...changes.changed]).toEqual([[1, ['price']]])
      expect(changes.reset).toBe(false)
    })

    it('the same row object is not compared', () => {
      const before = rows([1, 1])
      const t = track({ rows: before })
      const row = before[0]
      row.price = 9 // in place: not detected (immutable updates only)
      nothing(t.step({ rows: [row] }))
    })

    it('the same array changes nothing', () => {
      const same = rows([1, 1])
      const t = track({ rows: same })
      nothing(t.step({ rows: same }))
    })

    it('a moved row with the same values flashes nothing', () => {
      const t = track({ rows: rows([1, 1], [2, 2]) })
      nothing(t.step({ rows: rows([2, 2], [1, 1]) }))
    })

    it('new objects with the same values flash nothing', () => {
      const t = track({
        rows: [{ id: 1, price: 1, meta: { at: new Date(5) } }],
        fields: ['price', 'meta']
      })
      nothing(
        t.step({ rows: [{ id: 1, price: 1, meta: { at: new Date(5) } }] })
      )
    })

    it('a nested value is compared by structure', () => {
      const t = track({
        rows: [{ id: 1, meta: { at: new Date(5) } }],
        fields: ['meta.at']
      })
      const changes = t.step({ rows: [{ id: 1, meta: { at: new Date(6) } }] })
      expect([...changes.changed]).toEqual([[1, ['meta.at']]])
    })

    it('a shared mutable branch changed in place is not detected', () => {
      const meta = { at: new Date(5) }
      const t = track({ rows: [{ id: 1, meta }], fields: ['meta'] })
      meta.at = new Date(6)
      nothing(t.step({ rows: [{ id: 1, meta }] }))
    })

    it('a row that leaves and comes back in a later update is new', () => {
      const t = track({ rows: rows([1, 1], [2, 2]) })
      t.step({ rows: rows([1, 1]) })
      expect(t.step({ rows: rows([1, 1], [2, 2]) }).added).toEqual([2])
    })

    it('a key used for another entity is the same row', () => {
      const t = track({ rows: [{ id: 1, price: 1, name: 'a' }] })
      const changes = t.step({ rows: [{ id: 1, price: 1, name: 'b' }] })
      expect([...changes.changed]).toEqual([[1, ['name']]])
    })

    it('the number 1 and the string "1" are different keys', () => {
      const t = track({ rows: rows([1, 1]) })
      expect(t.step({ rows: rows(['1', 1]) }).added).toEqual(['1'])
    })

    it('A to B to A in one update is no change, in two updates two', () => {
      const t = track({ rows: rows([1, 1]) })
      nothing(t.step({ rows: rows([1, 1]) }))
      expect(t.step({ rows: rows([1, 2]) }).changed.size).toBe(1)
      expect(t.step({ rows: rows([1, 1]) }).changed.size).toBe(1)
    })

    it('two answers to the same query are compared in turn', () => {
      const t = track({ rows: rows([1, 1]) })
      nothing(t.step({ rows: rows([1, 1]) }))
      expect(t.step({ rows: rows([1, 3]) }).changed.size).toBe(1)
    })
  })

  describe('fields', () => {
    it('only fields drawn before and now are compared', () => {
      const t = track({ rows: rows([1, 1]), fields: ['price'] })
      nothing(
        t.step({
          rows: rows([1, 1]).map(r => ({ ...r, name: 'x' })),
          fields: ['price', 'name']
        })
      )
    })

    it('a field that leaves is dropped', () => {
      const t = track({ rows: rows([1, 1]) })
      const changes = t.step({ fields: ['price'] })
      expect(changes.droppedFields).toEqual(['name'])
      nothing(changes)
    })
  })

  describe('query boundaries (no hint: best effort)', () => {
    it('a query change resets and its answer is a baseline', () => {
      const t = track({ rows: rows([1, 1], [2, 2]) })
      const sorted = t.step({
        query: q({ sort: { field: 'price', direction: 'desc' } })
      })
      expect(sorted.reset).toBe(true)
      const answer = t.step({ rows: rows([2, 9], [1, 1], [3, 3]) })
      nothing(answer)
      expect(answer.reset).toBe(false)
      expect(t.step({ rows: rows([2, 8], [1, 1], [3, 3]) }).changed.size).toBe(
        1
      )
    })

    it('a query and its answer in the same update are a baseline', () => {
      const t = track({ rows: rows([1, 1]) })
      const changes = t.step({ query: q({ page: 2 }), rows: rows([5, 5]) })
      expect(changes.reset).toBe(true)
      nothing(changes)
    })

    it('loading off then rows on the next tick: the rows are still the answer', () => {
      const t = track({ rows: rows([1, 1]) })
      t.step({ query: q({ page: 2 }), loading: true })
      t.step({ loading: false })
      nothing(t.step({ rows: rows([5, 5]) }))
    })

    it('rows then loading off: the answer is a baseline, the next update flashes', () => {
      const t = track({ rows: rows([1, 1]) })
      t.step({ query: q({ page: 2 }), loading: true })
      nothing(t.step({ rows: rows([5, 5]) }))
      nothing(t.step({ loading: false }))
      expect(t.step({ rows: rows([5, 6]) }).changed.size).toBe(1)
    })

    it('a live update for the old query while loading is on is a baseline', () => {
      const t = track({ rows: rows([1, 1]) })
      t.step({ query: q({ page: 2 }), loading: true })
      nothing(t.step({ rows: rows([1, 2]) }))
      nothing(t.step({ rows: rows([5, 5]), loading: false }))
    })

    it('without loading a live update for the old query takes the boundary (documented limit)', () => {
      const t = track({ rows: rows([1, 1]) })
      t.step({ query: q({ page: 2 }) })
      nothing(t.step({ rows: rows([1, 2]) }))
      expect(t.step({ rows: rows([5, 5]) }).added).toEqual([5])
    })

    it('Q0, Q1, Q2, R2, R1: the late R1 reads as a change (documented limit)', () => {
      const t = track({ rows: rows([1, 1]) })
      t.step({ query: q({ page: 2 }), loading: true })
      t.step({ query: q({ page: 3 }) })
      nothing(t.step({ rows: rows([3, 3]), loading: false }))
      expect(t.step({ rows: rows([2, 2]) }).added).toEqual([2])
    })

    it('polling: rows and loading off in one update flash', () => {
      const t = track({ rows: rows([1, 1]) })
      t.step({ loading: true })
      expect(t.step({ rows: rows([1, 2]), loading: false }).changed.size).toBe(
        1
      )
    })

    it('an error that puts the old query back resets and keeps the rows', () => {
      const t = track({ rows: rows([1, 1]) })
      expect(t.step({ query: q({ page: 2 }), loading: true }).reset).toBe(true)
      expect(t.step({ query: q(), loading: false }).reset).toBe(true)
      nothing(t.step({ rows: rows([1, 1]) }))
    })

    it('a new query object of the same meaning is no query change', () => {
      const t = track({
        rows: rows([1, 1]),
        query: q({ tenant: { a: 1, b: 2 } } as never)
      })
      // Keys in another order, an empty search for a missing one.
      const same = {
        tenant: { b: 2, a: 1 },
        filters: [],
        sort: null,
        pageSize: 10,
        page: 1,
        search: ''
      } as unknown as Query
      expect(t.step({ query: same }).reset).toBe(false)
      expect(t.step({ rows: rows([1, 2]) }).changed.size).toBe(1)
    })

    it('an unknown query key that changes is a query change', () => {
      const t = track({ rows: rows([1, 1]) })
      expect(t.step({ query: { ...q(), tenant: 'b' } as Query }).reset).toBe(
        true
      )
    })

    it('the consumer changing its query object in place does not move the kept one', () => {
      const query = q()
      const t = track({ rows: rows([1, 1]), query })
      query.page = 2
      expect(t.step({ query }).reset).toBe(true)
    })
  })

  describe('the rowsUpdate hint (exact)', () => {
    const hinted = (hint: RowsUpdate) => {
      const t = track({ rows: rows([1, 1]) })
      return t.step({ rows: rows([1, 2], [2, 2]), hint })
    }

    it('live flashes', () => {
      const changes = hinted('live')
      expect(changes.added).toEqual([2])
      expect(changes.changed.size).toBe(1)
    })

    it('append adds silently and keeps marks', () => {
      const changes = hinted('append')
      nothing(changes)
      expect(changes.reset).toBe(false)
    })

    it.each<RowsUpdate>(['snapshot', 'reset'])('%s starts over', hint => {
      const changes = hinted(hint)
      nothing(changes)
      expect(changes.reset).toBe(true)
    })

    it('two snapshots in a row are two baselines', () => {
      const t = track({ rows: rows([1, 1]) })
      expect(t.step({ rows: rows([1, 2]), hint: 'snapshot' }).reset).toBe(true)
      expect(t.step({ rows: rows([1, 3]), hint: 'snapshot' }).reset).toBe(true)
    })

    it('live flashes while loading is on', () => {
      const t = track({ rows: rows([1, 1]) })
      t.step({ loading: true })
      expect(
        t.step({ rows: rows([1, 2]), loading: true, hint: 'live' }).changed.size
      ).toBe(1)
    })

    it('a constant live hint: the first rows after a query change are its answer', () => {
      const t = track({ rows: rows([1, 1], [2, 2]), hint: 'live' })
      const sort = q({ sort: { field: 'price', direction: 'desc' } })
      expect(t.step({ query: sort, hint: 'live' }).reset).toBe(true)
      nothing(t.step({ rows: rows([2, 9], [3, 3]), hint: 'live' }))
      // In one update with the query, too.
      nothing(t.step({ query: q(), rows: rows([4, 4]), hint: 'live' }))
      // After the answer, live updates flash again.
      expect(t.step({ rows: rows([4, 5]), hint: 'live' }).changed.size).toBe(1)
    })

    it('a constant live hint: the first non-empty rows are a baseline', () => {
      const t = track({ rows: [], hint: 'live' })
      nothing(t.step({ rows: rows([1, 1]), hint: 'live' }))
      expect(t.step({ rows: rows([1, 2]), hint: 'live' }).changed.size).toBe(1)
    })

    it('a constant live hint: a filter answer does not flash', () => {
      const t = track({ rows: rows([1, 1], [2, 2]), hint: 'live' })
      t.step({
        query: q({
          filters: [{ field: 'price', condition: 'Equals', value: '2' }]
        }),
        hint: 'live'
      })
      nothing(t.step({ rows: rows([2, 2], [7, 7]), hint: 'live' }))
    })

    it('a constant live hint: a live update for the old query before the answer makes the answer flash (documented limit)', () => {
      const t = track({ rows: rows([1, 1]), hint: 'live' })
      t.step({ query: q({ page: 2 }), hint: 'live' })
      // Data of the old query arrives first and takes the boundary.
      nothing(t.step({ rows: rows([1, 2]), hint: 'live' }))
      expect(t.step({ rows: rows([5, 5]), hint: 'live' }).added).toEqual([5])
    })

    it('a hint is read only when rows change', () => {
      const t = track({ rows: rows([1, 1]) })
      const changes = t.step({ hint: 'reset' })
      expect(changes.reset).toBe(false)
    })
  })

  describe('quiet (hidden document)', () => {
    it('produces no change and moves the baseline, so nothing replays', () => {
      const t = track({ rows: rows([1, 1]) })
      nothing(t.step({ rows: rows([1, 2], [2, 2]), quiet: true }))
      nothing(t.step({ rows: rows([1, 2], [2, 2]), quiet: false }))
      nothing(t.step({ rows: rows([1, 2], [2, 2]).map(r => ({ ...r })) }))
    })
  })

  describe('keys', () => {
    it('reports duplicate and missing keys', () => {
      const tracker = createRowChangeTracker<Row>(row => row.id)
      const base = {
        query: q(),
        loading: false,
        fields,
        hint: undefined,
        quiet: false
      }
      expect(tracker.update({ ...base, rows: rows([1, 1]) }).badKeys).toBe(
        false
      )
      expect(
        tracker.update({ ...base, rows: rows([1, 1], [1, 2]) }).badKeys
      ).toBe(true)
      expect(
        tracker.update({ ...base, rows: [{ id: undefined as never }] }).badKeys
      ).toBe(true)
    })
  })
})
