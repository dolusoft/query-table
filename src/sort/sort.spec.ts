import { describe, expect, it } from 'vitest'

import { nextDirection } from './sort'

describe('sort direction', () => {
  it('C-07 sorts ascending first, then flips', () => {
    expect(nextDirection(null, 'a')).toBe('asc')
    expect(nextDirection({ field: 'a', direction: 'asc' }, 'a')).toBe('desc')
    expect(nextDirection({ field: 'a', direction: 'desc' }, 'a')).toBe('asc')
    expect(nextDirection({ field: 'a', direction: 'desc' }, 'b')).toBe('asc')
  })
})
