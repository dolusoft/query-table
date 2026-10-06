import { describe, expect, it } from 'vitest'

import { columnTypeOf, valueAt } from './column'

describe('C-39 column types are read case-insensitively', () => {
  it('lower-cases the type and defaults to string', () => {
    expect(columnTypeOf({ field: 'a', type: 'String' as never })).toBe('string')
    expect(columnTypeOf({ field: 'a', type: 'DateTime' as never })).toBe(
      'datetime'
    )
    expect(columnTypeOf({ field: 'a' })).toBe('string')
    expect(columnTypeOf({ field: 'a', type: 'nonsense' as never })).toBe(
      'string'
    )
  })
})

describe('column values', () => {
  it('reads dotted paths and tolerates holes', () => {
    expect(valueAt({ a: { b: 3 } }, 'a.b')).toBe(3)
    expect(valueAt({ a: null }, 'a.b')).toBeUndefined()
    expect(valueAt({}, 'a.b')).toBeUndefined()
  })
})
