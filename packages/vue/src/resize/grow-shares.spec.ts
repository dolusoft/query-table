import { describe, expect, it } from 'vitest'

import { baseAt, divideRoom, type GrowingColumn } from './grow-shares'

// The division of a wide container's room among growing columns (ADR 0024,
// K321-2) and the base a drag emits (amendment, #136 D-05). Internal: the
// behavior is C-132, tested in a browser.

const col = (
  field: string,
  weight: number,
  base = 100,
  max?: number
): GrowingColumn => ({ field, weight, base, max })

describe('divideRoom', () => {
  it('divides by the weights', () => {
    expect(divideRoom(600, [col('a', 7), col('b', 3)])).toEqual({
      a: 420,
      b: 180
    })
    expect(divideRoom(300, [col('message', 1)])).toEqual({ message: 300 })
  })

  it('gives the pixels of the rounding to the last column, so the shares fill the room', () => {
    const shares = divideRoom(100, [col('a', 1), col('b', 1), col('c', 1)])
    expect(shares).toEqual({ a: 33, b: 33, c: 34 })
    // A fractional room: its whole pixels.
    const fractional = divideRoom(100.6, [col('a', 1), col('b', 1)])
    expect(fractional.a + fractional.b).toBe(100)
  })

  it('stops a column at its max and divides what it leaves among the others', () => {
    expect(divideRoom(600, [col('a', 1, 100, 250), col('b', 1, 100)])).toEqual({
      a: 150,
      b: 450
    })
    // Every column at its max: what is left is not given out.
    expect(
      divideRoom(600, [col('a', 1, 100, 150), col('b', 1, 100, 200)])
    ).toEqual({ a: 50, b: 100 })
    // A base already at its max takes nothing.
    expect(divideRoom(100, [col('a', 1, 300, 200), col('b', 1)])).toEqual({
      a: 0,
      b: 100
    })
  })

  it('gives nothing without room, without columns or without weight', () => {
    expect(divideRoom(0, [col('a', 1)])).toEqual({})
    expect(divideRoom(-50, [col('a', 1)])).toEqual({})
    expect(divideRoom(0.5, [col('a', 1)])).toEqual({})
    expect(divideRoom(100, [])).toEqual({})
    expect(divideRoom(100, [col('a', 0)])).toEqual({ a: 0 })
  })
})

describe('baseAt', () => {
  it('keeps a column at its drawn width once the room is divided again', () => {
    // Two growing columns of weight 1, bases 100, room 400: each drawn 300.
    // Dragged to 350, the room without its base is 500.
    const base = baseAt(350, 500, 1, 2)
    expect(base).toBe(200)
    // Divided again: room 1000 - 400 - 200 - 100 = 300, half each.
    const shares = divideRoom(300, [col('g', 1, base), col('h', 1, 100)])
    expect(base + shares.g).toBe(350)
    expect(100 + shares.h).toBe(250)
  })

  it('is the drawn width for a single growing column, or one wider than the room', () => {
    expect(baseAt(700, 600, 1, 1)).toBe(700)
    expect(baseAt(500, 600, 1, 1)).toBe(500)
    expect(baseAt(900, 500, 1, 2)).toBe(900)
  })
})
