// Ported from src/filter/filter-conditions.spec.ts (2.2): the grammar moved to the protocol
// unchanged, so its unit tests move with it.
import { describe, expect, it } from 'vitest'

import {
  conditionLabel,
  conditionOptions,
  conditionValues,
  defaultConditionFor,
  defaultConditionOf
} from '../src/grammar/conditions'
import type { FilterCondition } from '../src/protocol/types'

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

  it('the values without labels are those of conditionOptions, in order', () => {
    for (const [type, list] of Object.entries(conditionOptions)) {
      expect(conditionValues[type as keyof typeof conditionValues]).toEqual(
        list.map(option => option.value)
      )
    }
  })

  it('C-117 a column default the type offers wins, any other counts as unset', () => {
    expect(defaultConditionOf({ field: 'f' })).toBe('Contains')
    expect(
      defaultConditionOf({ field: 'f', filterDefaultCondition: 'Equal' })
    ).toBe('Equal')
    expect(
      defaultConditionOf({
        field: 'f',
        type: 'number',
        filterDefaultCondition: 'GreaterThan'
      })
    ).toBe('GreaterThan')
    for (const own of ['GreaterThan', 'IsNull', 'Between', 'nonsense']) {
      expect(
        defaultConditionOf({
          field: 'f',
          filterDefaultCondition: own as FilterCondition
        })
      ).toBe('Contains')
    }
    expect(
      defaultConditionOf({
        field: 'f',
        type: 'number',
        filterDefaultCondition: 'Contains'
      })
    ).toBe('Equal')
  })

  it('labels a condition and falls back to its name', () => {
    expect(conditionLabel('string', 'StartsWith')).toBe('Starts With')
    expect(conditionLabel('bool', 'Contains')).toBe('Contains')
  })
})
