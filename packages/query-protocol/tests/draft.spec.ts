// Ported from src/filter/filter-draft.spec.ts (2.2): the grammar moved to the protocol
// unchanged, so its unit tests move with it.
import { describe, expect, it } from 'vitest'

import {
  type Draft,
  draftFromRules,
  hasContent,
  parseDraft,
  rulesFromDraft
} from '../src/grammar/draft'
import type {
  FilterColumn,
  FilterValue,
  ValueCondition,
  ValueFilterRule
} from '../src/protocol/types'

const column = (type?: FilterColumn['type']): FilterColumn => ({
  field: 'f',
  type
})

const draft = (text: string, condition: Draft['condition'] = null): Draft => ({
  text,
  condition
})

const rule = (
  condition: ValueCondition,
  value: FilterValue
): ValueFilterRule => ({ field: 'f', condition, value })

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

  it('an integer column rejects a decimal and keeps a whole number', () => {
    expect(parseDraft(column('integer'), draft('2.5'))).toEqual([])
    expect(parseDraft(column('integer'), draft('-0.1', 'LessThan'))).toEqual([])
    expect(parseDraft(column('integer'), draft('-3'))).toEqual([
      { condition: 'Equal', value: -3 }
    ])
    expect(parseDraft(column('integer'), draft('2.0'))).toEqual([
      { condition: 'Equal', value: 2 }
    ])
    // A number column still takes the decimal.
    expect(parseDraft(column('number'), draft('2.5'))).toEqual([
      { condition: 'Equal', value: 2.5 }
    ])
  })

  it('an integer column rejects a whole number beyond the safe range', () => {
    const integer = column('integer')
    expect(parseDraft(integer, draft('9007199254740991'))).toEqual([
      { condition: 'Equal', value: Number.MAX_SAFE_INTEGER }
    ])
    expect(parseDraft(integer, draft('-9007199254740991'))).toEqual([
      { condition: 'Equal', value: Number.MIN_SAFE_INTEGER }
    ])
    // 2^53, 2^53 + 1 (which a number rounds to 2^53) and their negatives.
    for (const text of [
      '9007199254740992',
      '9007199254740993',
      '-9007199254740992',
      '-9007199254740993',
      '1e16'
    ]) {
      expect(parseDraft(integer, draft(text))).toEqual([])
    }
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
      draftFromRules(column('number'), [
        rule('GreaterThan', 20),
        rule('LessThan', 40)
      ])
    ).toEqual({ text: '', condition: 'GreaterThan', multi: 2 })
    expect(
      draftFromRules(column('date'), [
        rule('Equal', '2024-01-01'),
        rule('Equal', '2024-01-02')
      ])
    ).toEqual({ text: '', condition: 'Equal', multi: 2 })
  })

  it('a number list the grammar cannot write keeps the count', () => {
    // Mixed signs, and a value that does not read back in its column.
    expect(
      draftFromRules(column('integer'), [
        rule('Equal', 80),
        rule('NotEqual', 443)
      ])
    ).toEqual({ text: '', condition: 'Equal', multi: 2 })
    expect(
      draftFromRules(column('integer'), [rule('Equal', 1.5), rule('Equal', 2)])
    ).toEqual({ text: '', condition: 'Equal', multi: 2 })
    expect(
      draftFromRules(column('number'), [rule('Equal', '80'), rule('Equal', 2)])
    ).toEqual({ text: '', condition: 'Equal', multi: 2 })
    // A list of bounds does not read back (C-16).
    expect(
      draftFromRules(column('integer'), [
        rule('GreaterThan', -1),
        rule('GreaterThan', 2)
      ])
    ).toEqual({ text: '', condition: 'GreaterThan', multi: 2 })
  })
})

describe('C-16 Value types: number lists and negation (C-42 writes them back)', () => {
  const ports = column('integer')

  it('a list gives one rule per value, with the picked condition', () => {
    expect(parseDraft(ports, draft('80,443'))).toEqual([
      { condition: 'Equal', value: 80 },
      { condition: 'Equal', value: 443 }
    ])
    expect(
      parseDraft(column('number'), draft(' 1.5 , 2 ', 'NotEqual'))
    ).toEqual([
      { condition: 'NotEqual', value: 1.5 },
      { condition: 'NotEqual', value: 2 }
    ])
  })

  it('makes no rule for a list of bounds, where a decimal comma would hide', () => {
    // `> 0 or > 5` is `> 0`: the list would say only its loosest bound.
    const shares = column('number')
    expect(parseDraft(shares, draft('0,5', 'GreaterThan'))).toEqual([])
    expect(parseDraft(ports, draft('80,443', 'LessThanOrEqual'))).toEqual([])
    expect(parseDraft(shares, draft('0.5', 'GreaterThan'))).toEqual([
      { condition: 'GreaterThan', value: 0.5 }
    ])
    // The comma always separates values; a decimal is written with a dot.
    expect(parseDraft(shares, draft('0,5'))).toEqual([
      { condition: 'Equal', value: 0 },
      { condition: 'Equal', value: 5 }
    ])
  })

  it('a value after ! gives NotEqual, alone or in a list', () => {
    expect(parseDraft(ports, draft('!80'))).toEqual([
      { condition: 'NotEqual', value: 80 }
    ])
    expect(parseDraft(ports, draft('!80,!443'))).toEqual([
      { condition: 'NotEqual', value: 80 },
      { condition: 'NotEqual', value: 443 }
    ])
  })

  it('a blank segment is skipped', () => {
    expect(parseDraft(ports, draft('80,,443,'))).toEqual([
      { condition: 'Equal', value: 80 },
      { condition: 'Equal', value: 443 }
    ])
  })

  it('makes no rule when one value does not read', () => {
    expect(parseDraft(ports, draft('80,abc'))).toEqual([])
    expect(parseDraft(ports, draft('1.5,2'))).toEqual([])
    expect(parseDraft(ports, draft('80,!'))).toEqual([])
    expect(parseDraft(column('number'), draft('1.5,2'))).toHaveLength(2)
  })

  it('makes no rule for a mixed list (D-01 of #95)', () => {
    expect(parseDraft(ports, draft('80,!443'))).toEqual([])
    expect(parseDraft(ports, draft('!80,443', 'GreaterThan'))).toEqual([])
    // Mixed by the typed `!`, not by the conditions it ends up with.
    expect(parseDraft(ports, draft('80,!443', 'NotEqual'))).toEqual([])
  })

  it('a ! value is NotEqual whatever condition was picked', () => {
    expect(parseDraft(ports, draft('!80,!443', 'GreaterThan'))).toEqual([
      { condition: 'NotEqual', value: 80 },
      { condition: 'NotEqual', value: 443 }
    ])
    expect(parseDraft(ports, draft('80,443', 'NotEqual'))).toEqual([
      { condition: 'NotEqual', value: 80 },
      { condition: 'NotEqual', value: 443 }
    ])
  })

  it('a list shows as the text that reads back as it', () => {
    const cases: Array<[ValueFilterRule[], Draft]> = [
      [
        [rule('Equal', 80), rule('Equal', 443)],
        { text: '80,443', condition: 'Equal' }
      ],
      [
        [rule('Equal', -1), rule('Equal', 2)],
        { text: '-1,2', condition: 'Equal' }
      ],
      [
        [rule('NotEqual', 80), rule('NotEqual', 443)],
        { text: '!80,!443', condition: null }
      ]
    ]
    for (const [rules, shown] of cases) {
      expect(draftFromRules(ports, rules)).toEqual(shown)
      expect(rulesFromDraft(ports, shown)).toEqual(rules)
    }
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

describe('C-113 Conditions without a value: the condition is the rule', () => {
  it.each(['string', 'number', 'integer', 'bool', 'date', 'datetime'] as const)(
    'IsNull and IsNotNull parse to their rule on %s, whatever the text',
    type => {
      expect(parseDraft(column(type), draft('', 'IsNull'))).toEqual([
        { condition: 'IsNull' }
      ])
      expect(parseDraft(column(type), draft('ignored', 'IsNotNull'))).toEqual([
        { condition: 'IsNotNull' }
      ])
    }
  )

  it('the rule has no value key, not one that is undefined', () => {
    const [made] = rulesFromDraft(column('number'), draft('', 'IsNull'))
    expect(Object.keys(made)).toEqual(['field', 'condition'])
  })

  it('a single rule shows as its condition with no text', () => {
    expect(
      draftFromRules(column(), [{ field: 'f', condition: 'IsNotNull' }])
    ).toEqual({ text: '', condition: 'IsNotNull' })
  })

  it('with other rules on its field it shows their count, also on text', () => {
    expect(
      draftFromRules(column(), [
        { field: 'f', condition: 'IsNull' },
        rule('Contains', 'a')
      ])
    ).toEqual({ text: '', condition: 'IsNull', multi: 2 })
  })

  it('a picked condition alone is content', () => {
    expect(hasContent(draft('', 'IsNull'))).toBe(true)
  })
})

describe('C-114 Between: two bounds, both needed', () => {
  const range = (text: string, text2: string): Draft => ({
    text,
    text2,
    condition: 'Between'
  })

  it.each([
    ['number', '1.5', ' 3 ', 1.5, 3],
    ['integer', '-2', '7', -2, 7],
    ['date', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-31'],
    [
      'datetime',
      '2026-10-01T08:00',
      '2026-10-01',
      '2026-10-01T08:00',
      '2026-10-01'
    ]
  ] as const)(
    '%s bounds parse to one rule',
    (type, text, text2, value, value2) => {
      expect(parseDraft(column(type), range(text, text2))).toEqual([
        { condition: 'Between', value, value2 }
      ])
    }
  )

  it('keys the rule field, condition, value, value2', () => {
    const [made] = rulesFromDraft(column('number'), range('1', '2'))
    expect(Object.keys(made)).toEqual(['field', 'condition', 'value', 'value2'])
  })

  it('never swaps the bounds', () => {
    expect(parseDraft(column('number'), range('9', '1'))).toEqual([
      { condition: 'Between', value: 9, value2: 1 }
    ])
  })

  it.each([
    ['number', '1', ''],
    ['number', '', '2'],
    ['number', '1', 'x'],
    ['integer', '1', '2.5'],
    ['date', '2026-10-01', '  ']
  ] as const)(
    'an incomplete range on %s (%j, %j) is no rule',
    (type, text, text2) => {
      expect(parseDraft(column(type), range(text, text2))).toEqual([])
    }
  )

  it('makes no rule without text2', () => {
    expect(parseDraft(column('number'), draft('1', 'Between'))).toEqual([])
  })

  it.each(['string', 'bool'] as const)('makes no rule on %s', type => {
    expect(parseDraft(column(type), range('a', 'b'))).toEqual([])
  })

  it('a single rule shows both bounds', () => {
    expect(
      draftFromRules(column('number'), [
        { field: 'f', condition: 'Between', value: 1, value2: 2 }
      ])
    ).toEqual({ text: '1', text2: '2', condition: 'Between' })
  })

  it('a typed upper bound alone is content', () => {
    expect(hasContent(range('', '2'))).toBe(true)
    expect(hasContent({ text: '', text2: ' ', condition: null })).toBe(false)
  })
})

describe('C-117 A column default condition', () => {
  const exact: FilterColumn = { field: 'f', filterDefaultCondition: 'Equal' }

  it('is the base of text without an operator; shortcuts and a pick keep theirs', () => {
    expect(parseDraft(exact, draft('foo,*bar*'))).toEqual([
      { condition: 'Equal', value: 'foo' },
      { condition: 'Contains', value: 'bar' }
    ])
    expect(parseDraft(exact, draft('foo', 'Contains'))).toEqual([
      { condition: 'Contains', value: 'foo' }
    ])
  })

  it('shows its own rules as plain text with no pick, and reads them back', () => {
    const cases: Array<[ValueFilterRule[], Draft]> = [
      [[rule('Equal', 'foo')], { text: 'foo', condition: null }],
      [[rule('Contains', 'foo')], { text: '*foo*', condition: null }],
      [
        [rule('Equal', 'a'), rule('NotEqual', 'b')],
        { text: 'a,!b', condition: null }
      ],
      [[rule('StartsWith', 'foo')], { text: 'foo*', condition: null }]
    ]
    for (const [rules, shown] of cases) {
      expect(draftFromRules(exact, rules)).toEqual(shown)
      expect(rulesFromDraft(exact, shown)).toEqual(rules)
    }
  })

  it('without it, an Equal rule still keeps its pick', () => {
    expect(draftFromRules(column(), [rule('Equal', 'foo')])).toEqual({
      text: 'foo',
      condition: 'Equal'
    })
  })
})
