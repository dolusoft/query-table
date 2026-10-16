import { describe, expect, it } from 'vitest'

import { groupRuns, groupShape } from './group-runs'

const rows = (keys: unknown[]) =>
  keys.map((key, index) => ({
    row: { key },
    index,
    pinned: false as const
  }))
const byKey = (row: { key: unknown }) => row.key as string | number | null

describe('C-103 groupRuns', () => {
  it('splits consecutive rows with the same key into runs, never reordering', () => {
    const g = groupRuns(rows(['a', 'a', 'b', 'a']), byKey)
    expect(g.runs.map(run => [run.key, run.start, run.count])).toEqual([
      ['a', 0, 2],
      ['b', 2, 1],
      ['a', 3, 1]
    ])
    expect([...g.groupOf]).toEqual([0, 0, 1, 2])
    expect([...g.headersThrough]).toEqual([1, 1, 2, 3])
  })

  it('gives a key that comes back its own id, by how many runs of it came before', () => {
    const g = groupRuns(rows(['a', 'b', 'a', 1, '1']), byKey)
    expect(g.runs.map(run => run.id)).toEqual([
      'string:a#0',
      'string:b#0',
      'string:a#1',
      'number:1#0',
      'string:1#0'
    ])
  })

  it('keeps the first row and its index in rows', () => {
    const list = rows(['x', 'y', 'y'])
    list[1].index = 7
    const g = groupRuns(list, byKey)
    expect(g.runs[1].row).toBe(list[1].row)
    expect(g.runs[1].index).toBe(7)
  })

  it('puts null, undefined and NaN in no group, and they end the run before', () => {
    const g = groupRuns(
      rows(['a', null, 'a', undefined, Number.NaN, 'a']),
      byKey
    )
    expect([...g.groupOf]).toEqual([0, -1, 1, -1, -1, 2])
    expect(g.runs.map(run => run.count)).toEqual([1, 1, 1])
    expect([...g.headersThrough]).toEqual([1, 1, 2, 2, 2, 3])
  })

  it('passes each row and its index to groupBy', () => {
    const seen: Array<[unknown, number]> = []
    groupRuns(rows(['a', 'b']), (row, index) => {
      seen.push([row.key, index])
      return 'k'
    })
    expect(seen).toEqual([
      ['a', 0],
      ['b', 1]
    ])
  })

  it('has no run for no rows', () => {
    const g = groupRuns(rows([]), byKey)
    expect(g.runs).toEqual([])
    expect(g.groupOf.length).toBe(0)
  })
})

describe('C-104 groupShape', () => {
  it('is null without groups and the start and count of each run otherwise', () => {
    expect(groupShape(null)).toBeNull()
    expect(groupShape(groupRuns(rows(['a', 'a', 'b']), byKey))).toBe('0:2,2:1')
  })

  it('is the same string for new rows with the same runs', () => {
    const one = groupShape(groupRuns(rows(['a', 'b']), byKey))
    const two = groupShape(groupRuns(rows(['c', 'd']), byKey))
    expect(two).toBe(one)
  })
})
