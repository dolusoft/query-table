// Ported from src/filter/filter-conditions.spec.ts (2.2): the grammar moved to the protocol
// unchanged, so its unit tests move with it.
import { describe, expect, it } from 'vitest'

import {
  conditionLabel,
  conditionOptions,
  defaultConditionFor
} from '../src/grammar/conditions'

describe('filter conditions per column type', () => {
  it('no list contains an empty "no filter" entry', () => {
    for (const list of Object.values(conditionOptions)) {
      expect(list.every(option => option.value !== ('' as never))).toBe(true)
    }
  })

  it('no list offers a condition twice', () => {
    for (const list of Object.values(conditionOptions)) {
      const values = list.map(option => option.value)
      expect(new Set(values).size).toBe(values.length)
    }
  })

  it('C-16 text matches by Contains, every other type exactly', () => {
    expect(defaultConditionFor('string')).toBe('Contains')
    for (const type of [
      'number',
      'integer',
      'date',
      'datetime',
      'bool'
    ] as const) {
      expect(defaultConditionFor(type)).toBe('Equal')
    }
  })

  it('labels a condition and falls back to its name', () => {
    expect(conditionLabel('string', 'StartsWith')).toBe('Starts With')
    expect(conditionLabel('bool', 'Contains')).toBe('Contains')
  })
})
