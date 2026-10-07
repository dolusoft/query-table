import { describe, expect, it } from 'vitest'

import { sameValue } from '../src/row-changes'

class Point {
  constructor(
    readonly x: number,
    readonly y: number
  ) {}
}

const cyclic = () => {
  const node: { name: string; self?: unknown } = { name: 'a' }
  node.self = node
  return node
}

const shared = { a: 1 }
const sharedMap = new Map([[1, 2]])
const sharedSet = new Set([1])
const sharedPoint = new Point(1, 2)
const sharedCycle = cyclic()
const fn = () => 1

// [label, a, b, same]: every pair is checked both ways (symmetry).
const cases: Array<[string, unknown, unknown, boolean]> = [
  ['equal numbers', 1, 1, true],
  ['different numbers', 1, 2, false],
  ['NaN equals NaN', NaN, NaN, true],
  ['0 equals -0', 0, -0, true],
  ['equal strings', 'a', 'a', true],
  ['number and string', 1, '1', false],
  ['null and undefined', null, undefined, false],
  ['null and null', null, null, true],
  ['undefined and undefined', undefined, undefined, true],
  ['booleans', true, false, false],
  ['bigint', 1n, 1n, true],
  ['dates of the same time', new Date(5), new Date(5), true],
  ['dates of different times', new Date(5), new Date(6), false],
  ['invalid dates', new Date(NaN), new Date('x'), true],
  ['date and its number', new Date(5), 5, false],
  ['equal arrays', [1, [2, 3]], [1, [2, 3]], true],
  ['arrays in another order', [1, 2], [2, 1], false],
  ['arrays of another length', [1], [1, 1], false],
  ['array and object', [1], { 0: 1 }, false],
  ['objects in any key order', { a: 1, b: 2 }, { b: 2, a: 1 }, true],
  ['objects with another value', { a: 1 }, { a: 2 }, false],
  ['objects with another key', { a: 1 }, { b: 1 }, false],
  ['missing key and undefined', { a: undefined }, {}, false],
  ['nested dates', { d: [new Date(1)] }, { d: [new Date(1)] }, true],
  ['nested NaN', { n: [NaN] }, { n: [NaN] }, true],
  [
    'null-prototype object',
    Object.assign(Object.create(null), { a: 1 }),
    { a: 1 },
    true
  ],
  ['the same object', shared, shared, true],
  ['maps by reference', new Map([[1, 2]]), new Map([[1, 2]]), false],
  ['the same map', sharedMap, sharedMap, true],
  ['sets by reference', new Set([1]), new Set([1]), false],
  ['the same set', sharedSet, sharedSet, true],
  ['class instances by reference', new Point(1, 2), new Point(1, 2), false],
  ['the same instance', sharedPoint, sharedPoint, true],
  ['instance and plain object', new Point(1, 2), { x: 1, y: 2 }, false],
  ['functions by reference', () => 1, () => 1, false],
  ['the same function', fn, fn, true],
  ['two cycles of the same shape', cyclic(), cyclic(), false],
  ['the same cycle', sharedCycle, sharedCycle, true]
]

describe('C-92 sameValue', () => {
  it.each(cases)('%s', (_label, a, b, same) => {
    expect(sameValue(a, b)).toBe(same)
    expect(sameValue(b, a)).toBe(same)
  })

  it('ends on a cycle nested in equal-looking values', () => {
    const a = { list: [cyclic()] }
    const b = { list: [cyclic()] }
    expect(sameValue(a, b)).toBe(false)
  })
})
