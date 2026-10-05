import { describe, expect, it } from 'vitest'

import {
  conditionLabel,
  defaultConditionFor,
  filterConditions,
  isUnaryCondition
} from './filter-conditions'

describe('filter conditions per column type', () => {
  it('no list contains an empty "no filter" entry', () => {
    for (const list of Object.values(filterConditions)) {
      expect(list.every(option => option.value !== ('' as never))).toBe(true)
    }
  })

  it('every list ends with the two emptiness conditions, except bool', () => {
    for (const [type, list] of Object.entries(filterConditions)) {
      const tail = list.slice(-2).map(option => option.value)
      expect(tail).toEqual(
        type === 'bool' ? ['Equal', 'NotEqual'] : ['IsNull', 'IsNotNull']
      )
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
    expect(isUnaryCondition('IsNull')).toBe(true)
    expect(isUnaryCondition('Equal')).toBe(false)
    expect(isUnaryCondition(null)).toBe(false)
  })
})
