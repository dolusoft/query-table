import { describe, expect, it } from 'vitest'

import { clampWidth } from './use-column-resize'
import type { Column } from '../contract'

const columns = (): Column[] => [
  { field: 'id', title: 'ID', resizable: false },
  { field: 'name', title: 'Name', minWidth: 60, maxWidth: 300 },
  { field: 'age', title: 'Age' }
]

describe('C-49 Dragging a handle', () => {
  it('clamps a width to whole pixels within minWidth and maxWidth', () => {
    const column = columns()[1]
    expect(clampWidth(column, 10)).toBe(60)
    expect(clampWidth(column, 1000)).toBe(300)
    expect(clampWidth(column, 120.4)).toBe(120)
    expect(clampWidth({ field: 'x' }, 3)).toBe(40)
  })

  // JS and loosely typed consumers can pass what the types forbid.
  const loose = (limits: Record<string, unknown>) =>
    ({ field: 'x', ...limits }) as Column

  it.each([[''], [NaN], [Infinity], [-Infinity], [0], [-5], [null], ['80']])(
    'treats maxWidth %j as unset: no maximum, never 0',
    bad => {
      const column = loose({ maxWidth: bad })
      expect(clampWidth(column, 500)).toBe(500)
      expect(clampWidth(column, 10)).toBe(40)
    }
  )

  it.each([[''], [NaN], [Infinity], [-Infinity], [0], [-5], [null], ['80']])(
    'treats minWidth %j as unset: the default 40 applies',
    bad => {
      const column = loose({ minWidth: bad, maxWidth: 300 })
      expect(clampWidth(column, 1)).toBe(40)
      expect(clampWidth(column, 1000)).toBe(300)
    }
  )

  it('uses minWidth when it is above maxWidth', () => {
    const column = loose({ minWidth: 200, maxWidth: 100 })
    expect(clampWidth(column, 10)).toBe(200)
    expect(clampWidth(column, 150)).toBe(200)
    expect(clampWidth(column, 1000)).toBe(200)
  })

  it('lets the default minimum give way to a smaller maxWidth', () => {
    const column = loose({ maxWidth: 20 })
    expect(clampWidth(column, 1)).toBe(20)
    expect(clampWidth(column, 500)).toBe(20)
  })
})
