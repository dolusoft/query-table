import { describe, expect, it } from 'vitest'

import type { Column, FilterRule } from '../contract'
import {
  type Draft,
  draftFromRules,
  hasContent,
  parseDraft
} from './filter-draft'

const column = (type?: Column['type']): Column => ({
  field: 'f',
  title: 'F',
  type
})

const draft = (text: string, condition: Draft['condition'] = null): Draft => ({
  text,
  condition
})

const rule = (
  condition: FilterRule['condition'],
  value: FilterRule['value']
): FilterRule => ({ field: 'f', condition, value })

describe('C-16 Value types: a draft parses into rules', () => {
  it('text columns read shortcuts and default to Contains', () => {
    expect(parseDraft(column(), draft('foo'))).toEqual([
      { condition: 'Contains', value: 'foo' }
    ])
    expect(parseDraft(column('string'), draft('a,!b'))).toEqual([
      { condition: 'Contains', value: 'a' },
      { condition: 'NotEqual', value: 'b' }
    ])
  })

  it('a picked condition is the base of text without an operator', () => {
    expect(parseDraft(column(), draft('foo', 'StartsWith'))).toEqual([
      { condition: 'StartsWith', value: 'foo' }
    ])
  })

  it('number and integer columns give number values, Equal by default', () => {
    expect(parseDraft(column('number'), draft(' 4.5 '))).toEqual([
      { condition: 'Equal', value: 4.5 }
    ])
    expect(parseDraft(column('integer'), draft('7', 'GreaterThan'))).toEqual([
      { condition: 'GreaterThan', value: 7 }
    ])
  })

  it('text that is not a number makes no rule', () => {
    expect(parseDraft(column('number'), draft('abc'))).toEqual([])
    expect(parseDraft(column('integer'), draft('Infinity'))).toEqual([])
  })

  it('bool columns give boolean values and nothing else', () => {
    expect(parseDraft(column('bool'), draft('true'))).toEqual([
      { condition: 'Equal', value: true }
    ])
    expect(parseDraft(column('bool'), draft('false'))).toEqual([
      { condition: 'Equal', value: false }
    ])
    expect(parseDraft(column('bool'), draft('yes'))).toEqual([])
  })

  it('date and datetime columns give string values', () => {
    expect(parseDraft(column('date'), draft('2026-10-05'))).toEqual([
      { condition: 'Equal', value: '2026-10-05' }
    ])
    expect(parseDraft(column('datetime'), draft('2026-10-05T10:00'))).toEqual([
      { condition: 'Equal', value: '2026-10-05T10:00' }
    ])
  })

  it('an empty text makes no rule, whatever the type', () => {
    for (const type of ['string', 'number', 'bool', 'date'] as const) {
      expect(parseDraft(column(type), draft('   '))).toEqual([])
    }
  })
})

describe('C-18 The input follows outside changes: a draft shows rules', () => {
  it('no rules make a blank draft', () => {
    expect(draftFromRules(column(), [])).toEqual({
      text: '',
      condition: null
    })
  })

  it('a text rule of the default condition shows as plain text', () => {
    expect(draftFromRules(column(), [rule('Contains', 'foo')])).toEqual({
      text: 'foo',
      condition: null
    })
  })

  it('a text rule keeps its shortcut when plain text would read as an operator', () => {
    const shown = draftFromRules(column(), [rule('Contains', '*odd')])
    expect(shown.text).toBe('**odd*')
    expect(parseDraft(column(), shown)).toEqual([
      { condition: 'Contains', value: '*odd' }
    ])
  })

  it('rules of other conditions are written with their shortcut', () => {
    const rules = [rule('Contains', 'a'), rule('NotEqual', 'b')]
    const shown = draftFromRules(column(), rules)
    expect(shown.text).toBe('a,!b')
    expect(
      parseDraft(column(), shown).map(item => ({ ...item, field: 'f' }))
    ).toEqual(rules)
  })

  it('a rule without a shortcut becomes the base condition of the draft', () => {
    const shown = draftFromRules(column(), [rule('StartsWith', 'x')])
    expect(shown).toEqual({ text: 'x*', condition: null })
    expect(draftFromRules(column(), [rule('Equal', 'x')])).toEqual({
      text: 'x',
      condition: 'Equal'
    })
  })

  it('a single rule of another type shows its value and condition', () => {
    expect(draftFromRules(column('number'), [rule('GreaterThan', 5)])).toEqual({
      text: '5',
      condition: 'GreaterThan'
    })
  })
})

describe('C-17 Several rules for one field: a read-only count', () => {
  it('a non-text column with several rules shows their count, not a value', () => {
    expect(
      draftFromRules(column('number'), [rule('Equal', 1), rule('Equal', 2)])
    ).toEqual({ text: '', condition: 'Equal', multi: 2 })
  })
})

describe('hasContent', () => {
  it('is true for text or for a picked condition', () => {
    expect(hasContent(draft('x'))).toBe(true)
    expect(hasContent(draft('', 'Equal'))).toBe(true)
  })

  it('is false for a blank or whitespace-only draft', () => {
    expect(hasContent(draft(''))).toBe(false)
    expect(hasContent(draft('  '))).toBe(false)
  })
})
