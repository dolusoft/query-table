import { describe, expect, it } from 'vitest'

import type { Column } from '../contract'
import {
  applyOrder,
  applyPinning,
  applyVisibility,
  applyWidth,
  moveField,
  sideOf
} from './column-layout'

const cols = (): Column[] => [
  { field: 'a' },
  { field: 'h', hide: true },
  { field: 'b', pinned: 'left' },
  { field: 'c', pinned: 'right' }
]

describe('column layout helpers', () => {
  it('reads the side of a column', () => {
    expect(cols().map(sideOf)).toEqual([false, false, 'left', 'right'])
  })

  it('applies visibility: only changed columns are new, hide is deleted not set false', () => {
    const before = cols()
    const next = applyVisibility(before, { a: false, h: true })!
    expect(next).toEqual([
      { field: 'a', hide: true },
      { field: 'h' },
      before[2],
      before[3]
    ])
    expect(next[2]).toBe(before[2])
    expect('hide' in next[1]).toBe(false)
    expect(applyVisibility(before, { a: true, h: false })).toBeNull()
  })

  it('treats hide: false as visible', () => {
    expect(
      applyVisibility([{ field: 'a', hide: false }], { a: true })
    ).toBeNull()
  })

  it('applies an order and keeps fields the order leaves out at the end', () => {
    const before = cols()
    expect(applyOrder(before, ['b', 'a'])!.map(c => c.field)).toEqual([
      'b',
      'a',
      'h',
      'c'
    ])
    expect(applyOrder(before, ['a', 'h', 'b', 'c'])).toBeNull()
    expect(applyOrder(before, ['zz', 'a', 'h', 'b', 'c'])).toBeNull()
  })

  it('applies pinning and keeps the array order', () => {
    const before = cols()
    const next = applyPinning(before, { start: ['b'], end: ['a', 'c'] })!
    expect(next.map(c => c.pinned)).toEqual([
      'right',
      undefined,
      'left',
      'right'
    ])
    expect(next[2]).toBe(before[2])
    const unpinned = applyPinning(before, { start: [], end: ['c'] })!
    expect('pinned' in unpinned[2]).toBe(false)
    expect(applyPinning(before, { start: ['b'], end: ['c'] })).toBeNull()
  })

  it('applies a width', () => {
    const before = cols()
    expect(applyWidth(before, 'a', '120px')![0]).toEqual({
      field: 'a',
      width: '120px'
    })
    expect(applyWidth([{ field: 'a', width: '9px' }], 'a', '9px')).toBeNull()
    expect(applyWidth(before, 'zz', '9px')).toBeNull()
  })

  it('moves a field next to a target; hidden ones keep their place', () => {
    expect(moveField(['a', 'h', 'b'], 'b', 'a', 'before')).toEqual([
      'b',
      'a',
      'h'
    ])
    expect(moveField(['a', 'h', 'b'], 'a', 'b', 'after')).toEqual([
      'h',
      'b',
      'a'
    ])
    expect(moveField(['a', 'b'], 'a', 'a', 'after')).toEqual(['a', 'b'])
    expect(moveField(['a', 'b'], 'a', 'zz', 'after')).toEqual(['a', 'b'])
  })

  it('keeps the consumer fields of a changed column', () => {
    const before = [{ field: 'a', group: 'x' } as Column]
    expect(applyVisibility(before, { a: false })![0]).toEqual({
      field: 'a',
      group: 'x',
      hide: true
    })
  })
})
