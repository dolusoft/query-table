import { describe, expect, it } from 'vitest'

import type { FilterCondition } from '../contract'
import {
  hasShortcut,
  parseShortcuts,
  previewCondition,
  serializeFilterRules
} from './filter-input-parser'

describe('C-15 operator shortcuts parse into clean rules', () => {
  it.each<[string, FilterCondition, string]>([
    ['*foo*', 'Contains', 'foo'],
    ['foo*', 'StartsWith', 'foo'],
    ['*foo', 'EndsWith', 'foo'],
    ['!foo', 'NotEqual', 'foo'],
    ['!*foo*', 'NotContains', 'foo'],
    ['!foo*', 'NotContains', 'foo'],
    ['!*foo', 'NotContains', 'foo']
  ])('%s is %s of "%s"', (input, condition, value) => {
    expect(parseShortcuts(input)).toEqual([{ condition, value }])
  })

  it('a segment without an operator takes the base condition', () => {
    expect(parseShortcuts('foo')).toEqual([
      { condition: 'Contains', value: 'foo' }
    ])
    expect(parseShortcuts('foo', 'Equal')).toEqual([
      { condition: 'Equal', value: 'foo' }
    ])
    expect(parseShortcuts('foo', 'StartsWith')).toEqual([
      { condition: 'StartsWith', value: 'foo' }
    ])
  })

  it.each(['', '   ', '*', '**', '!', '!*', '!**', ',', ' , ', '*,*'])(
    'input %j makes no rule',
    input => {
      expect(parseShortcuts(input)).toEqual([])
    }
  )

  it('trims the input and the segments', () => {
    expect(parseShortcuts('  a , b  ', 'Equal')).toEqual([
      { condition: 'Equal', value: 'a' },
      { condition: 'Equal', value: 'b' }
    ])
  })

  it('skips empty segments between commas', () => {
    expect(parseShortcuts('a,,*,b', 'Equal').map(r => r.value)).toEqual([
      'a',
      'b'
    ])
  })

  it('keeps the known limits: no escape, a comma always splits, only the outer stars count', () => {
    // current behavior, pinned on purpose
    expect(parseShortcuts('\\*face', 'Equal')).toEqual([
      { condition: 'Equal', value: '\\*face' }
    ])
    expect(parseShortcuts('a\\,b', 'Equal').map(r => r.value)).toEqual([
      'a\\',
      'b'
    ])
    expect(parseShortcuts('a*b', 'Equal')).toEqual([
      { condition: 'Equal', value: 'a*b' }
    ])
  })
})

describe('C-17 several rules for one field', () => {
  it('a,b gives one rule per segment, each with its own condition', () => {
    expect(parseShortcuts('!*youtube*,vimeo*')).toEqual([
      { condition: 'NotContains', value: 'youtube' },
      { condition: 'StartsWith', value: 'vimeo' }
    ])
  })
})

describe('serializeFilterRules', () => {
  it('writes every condition that has a shortcut as its shortcut', () => {
    expect(
      serializeFilterRules([
        { condition: 'Contains', value: 'a' },
        { condition: 'StartsWith', value: 'b' },
        { condition: 'EndsWith', value: 'c' },
        { condition: 'NotContains', value: 'd' },
        { condition: 'NotEqual', value: 'e' }
      ])
    ).toBe('*a*,b*,*c,!*d*,!e')
  })

  it('writes the others as plain text', () => {
    expect(
      serializeFilterRules([
        { condition: 'Equal', value: 'a' },
        { condition: 'GreaterThan', value: 5 }
      ])
    ).toBe('a,5')
    expect(hasShortcut('Equal')).toBe(false)
    expect(hasShortcut('Contains')).toBe(true)
  })

  it('round-trips: parse(serialize(rules), base) gives the rules back', () => {
    const conditions: FilterCondition[] = [
      'Contains',
      'NotContains',
      'NotEqual',
      'StartsWith',
      'EndsWith'
    ]
    const values = ['a', 'foo bar', 'x-1', 'Ünï']
    // Every pair and triple of the shortcut conditions.
    for (const first of conditions) {
      for (const second of conditions) {
        const rules = [
          { condition: first, value: values[0] },
          { condition: second, value: values[1] },
          { condition: first, value: values[2] }
        ]
        expect(parseShortcuts(serializeFilterRules(rules))).toEqual(rules)
      }
    }
    // A plain condition needs to be the base.
    const plain = [{ condition: 'Equal' as const, value: 'a' }]
    expect(parseShortcuts(serializeFilterRules(plain), 'Equal')).toEqual(plain)
  })
})

describe('previewCondition', () => {
  it.each<[string, FilterCondition]>([
    ['*', 'Contains'],
    ['!*', 'NotContains'],
    ['!', 'NotEqual'],
    ['foo*', 'StartsWith'],
    ['foo', 'Contains']
  ])('%s previews %s', (input, condition) => {
    expect(previewCondition(input, 'Contains')).toBe(condition)
  })

  it('falls back to the base for text that makes no rule', () => {
    expect(previewCondition('', 'Equal')).toBe('Equal')
  })
})
