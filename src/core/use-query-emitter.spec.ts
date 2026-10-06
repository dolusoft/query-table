import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'

import type { QueryChangeReason, TableQuery } from '../contract'
import { useQueryEmitter } from './use-query-emitter'
import { makeQuery } from '../../tests/support/mount-table'

describe('useQueryEmitter', () => {
  const setup = () => {
    const query = ref(makeQuery())
    const emitted: Array<[TableQuery, QueryChangeReason]> = []
    const scope = effectScope()
    const emitter = scope.run(() =>
      useQueryEmitter({
        query: () => query.value,
        emit: (next, reason) => emitted.push([next, reason])
      })
    )!
    return { query, emitted, scope, ...emitter }
  }

  it('C-04 swallows a query equal to the base', () => {
    const { emitted, update, scope } = setup()
    update(makeQuery(), 'page')
    expect(emitted).toEqual([])
    scope.stop()
  })

  it('stacks actions of one tick: the last emitted query is the base', () => {
    const { emitted, base, update, scope } = setup()
    update({ ...base(), sort: { field: 'name', direction: 'asc' } }, 'sort')
    update({ ...base(), page: 2 }, 'page')
    expect(emitted.map(([, reason]) => reason)).toEqual(['sort', 'page'])
    expect(emitted[1][0]).toEqual(
      makeQuery({ page: 2, sort: { field: 'name', direction: 'asc' } })
    )
    scope.stop()
  })

  it('emits a copy that shares nothing with the query it was given', () => {
    const { emitted, update, scope } = setup()
    const next = makeQuery({
      filters: [{ field: 'a', condition: 'Equal', value: 1 }]
    })
    update(next, 'filter')
    expect(emitted[0][0]).toEqual(next)
    expect(emitted[0][0]).not.toBe(next)
    expect(emitted[0][0].filters[0]).not.toBe(next.filters[0])
    scope.stop()
  })

  it('C-19 goes back to the consumer query when the tick ends', async () => {
    const { query, base, update, scope } = setup()
    update({ ...base(), page: 2 }, 'page')
    expect(base().page).toBe(2)
    await Promise.resolve()
    expect(base()).toBe(query.value)
    scope.stop()
  })

  it('goes back to the consumer query as soon as it changes', () => {
    const { query, base, update, scope } = setup()
    update({ ...base(), page: 2 }, 'page')
    query.value = makeQuery({ page: 3 })
    expect(base()).toBe(query.value)
    scope.stop()
  })
})
