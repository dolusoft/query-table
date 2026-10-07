import { describe, expect, it } from 'vitest'

import {
  computeWindow,
  fillOffsets,
  indexAt,
  segmentsOf
} from './compute-window'

const offsetsOf = (heights: number[]) => {
  const offsets = new Float64Array(heights.length + 1)
  fillOffsets(heights, offsets)
  return offsets
}

describe('C-83 C-84 compute-window', () => {
  it('sums the heights into offsets, from a position on', () => {
    const offsets = offsetsOf([10, 20, 30])
    expect([...offsets]).toEqual([0, 10, 30, 60])
    const heights = [10, 5, 30]
    fillOffsets(heights, offsets, 1)
    expect([...offsets]).toEqual([0, 10, 15, 45])
  })

  it('finds the item that holds a point, clamped to the items', () => {
    const offsets = offsetsOf([10, 20, 30])
    expect(indexAt(offsets, -5)).toBe(0)
    expect(indexAt(offsets, 0)).toBe(0)
    expect(indexAt(offsets, 9.9)).toBe(0)
    expect(indexAt(offsets, 10)).toBe(1)
    expect(indexAt(offsets, 59)).toBe(2)
    expect(indexAt(offsets, 500)).toBe(2)
    expect(indexAt(new Float64Array(1), 0)).toBe(-1)
  })

  it('draws the items in view and overscan more on each side', () => {
    const offsets = offsetsOf(Array<number>(100).fill(20))
    expect(
      computeWindow({ offsets, scrollTop: 0, viewportHeight: 100, overscan: 0 })
    ).toEqual({ start: 0, end: 5 })
    expect(
      computeWindow({
        offsets,
        scrollTop: 410,
        viewportHeight: 100,
        overscan: 3
      })
    ).toEqual({ start: 17, end: 29 })
    // The end is clamped to the items.
    expect(
      computeWindow({
        offsets,
        scrollTop: 1990,
        viewportHeight: 100,
        overscan: 10
      })
    ).toEqual({ start: 89, end: 100 })
    expect(
      computeWindow({
        offsets: new Float64Array(1),
        scrollTop: 0,
        viewportHeight: 100,
        overscan: 10
      })
    ).toEqual({ start: 0, end: 0 })
  })

  it('leaves out the item that starts exactly at the bottom edge', () => {
    const offsets = offsetsOf([50, 50, 50])
    expect(
      computeWindow({ offsets, scrollTop: 0, viewportHeight: 100, overscan: 0 })
    ).toEqual({ start: 0, end: 2 })
  })

  it('places spacers around the drawn run and leaves out empty ones', () => {
    const offsets = offsetsOf([10, 10, 10, 10, 10])
    expect(segmentsOf(offsets, { start: 1, end: 3 }, null)).toEqual([
      { spacer: 10, slot: 0 },
      { from: 1, to: 3 },
      { spacer: 20, slot: 2 }
    ])
    expect(segmentsOf(offsets, { start: 0, end: 5 }, null)).toEqual([
      { from: 0, to: 5 }
    ])
  })

  it('C-86 keeps a focused item outside the run between spacers of its own', () => {
    const offsets = offsetsOf([10, 10, 10, 10, 10, 10])
    expect(segmentsOf(offsets, { start: 3, end: 5 }, 0)).toEqual([
      { from: 0, to: 1 },
      { spacer: 20, slot: 1 },
      { from: 3, to: 5 },
      { spacer: 10, slot: 2 }
    ])
    expect(segmentsOf(offsets, { start: 0, end: 2 }, 4)).toEqual([
      { from: 0, to: 2 },
      { spacer: 20, slot: 1 },
      { from: 4, to: 5 },
      { spacer: 10, slot: 2 }
    ])
    // Inside the run it changes nothing.
    expect(segmentsOf(offsets, { start: 0, end: 2 }, 1)).toEqual([
      { from: 0, to: 2 },
      { spacer: 40, slot: 2 }
    ])
  })
})
