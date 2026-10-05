import { describe, expect, it } from 'vitest'

import { parseFilterInput } from '../src/model/filter-input-parser'

const single = (
  value: string,
  condition: string,
  isOperatorDetected = true
) => ({
  rules: [{ value, condition }],
  displayCondition: condition,
  isOperatorDetected
})

const EMPTY = { rules: [], displayCondition: '', isOperatorDetected: false }

describe('parseFilterInput — operator shortcuts', () => {
  it.each([
    ['*face*', single('face', 'Contains')],
    ['face*', single('face', 'StartsWith')],
    ['*face', single('face', 'EndsWith')],
    ['!face', single('face', 'NotEqual')],
    ['!*face*', single('face', 'NotContains')],
    // backend has no NotStartsWith / NotEndsWith: both fall back to NotContains
    ['!face*', single('face', 'NotContains')],
    ['!*face', single('face', 'NotContains')],
    ['face', single('face', 'Equal', false)]
  ])('%s', (input, expected) => {
    expect(parseFilterInput(input)).toEqual(expected)
  })

  it('a,b → one rule per segment, display condition from the first', () => {
    expect(parseFilterInput('!*youtube*,*vimeo*')).toEqual({
      rules: [
        { value: 'youtube', condition: 'NotContains' },
        { value: 'vimeo', condition: 'Contains' }
      ],
      displayCondition: 'NotContains',
      isOperatorDetected: true
    })
  })

  it('a,b without operators → Equal rules, no operator detected', () => {
    expect(parseFilterInput('a,b')).toEqual({
      rules: [
        { value: 'a', condition: 'Equal' },
        { value: 'b', condition: 'Equal' }
      ],
      displayCondition: 'Equal',
      isOperatorDetected: false
    })
  })

  it('operator in any segment marks the whole input as detected', () => {
    const r = parseFilterInput('a,b*')
    expect(r.isOperatorDetected).toBe(true)
    expect(r.displayCondition).toBe('Equal')
  })
})

describe('parseFilterInput — edge cases', () => {
  it.each([
    [''],
    ['   '],
    ['*'],
    ['**'],
    ['***'],
    ['!'],
    ['!*'],
    ['!**'],
    [','],
    [' , , '],
    ['* *']
  ])('%j → empty result', input => {
    expect(parseFilterInput(input)).toEqual(EMPTY)
  })

  it('non-string input → empty result', () => {
    expect(parseFilterInput(undefined as any)).toEqual(EMPTY)
    expect(parseFilterInput(null as any)).toEqual(EMPTY)
    expect(parseFilterInput(42 as any)).toEqual(EMPTY)
  })

  it('trims surrounding whitespace and inner whitespace after stripping', () => {
    expect(parseFilterInput('  * face *  ')).toEqual(single('face', 'Contains'))
    expect(parseFilterInput(' a , b ').rules).toEqual([
      { value: 'a', condition: 'Equal' },
      { value: 'b', condition: 'Equal' }
    ])
  })

  it('empty segments are dropped', () => {
    expect(parseFilterInput('a,,*,b').rules.map(r => r.value)).toEqual([
      'a',
      'b'
    ])
  })

  it('current behavior: no escape syntax — backslash is kept literally', () => {
    // leading "\*" is not a leading star, so the input is a plain Equal
    expect(parseFilterInput('\\*face')).toEqual(
      single('\\*face', 'Equal', false)
    )
    // trailing "\*" still acts as the StartsWith operator
    expect(parseFilterInput('face\\*')).toEqual(single('face\\', 'StartsWith'))
  })

  it('current behavior: comma cannot be escaped, it always splits', () => {
    expect(parseFilterInput('a\\,b').rules).toEqual([
      { value: 'a\\', condition: 'Equal' },
      { value: 'b', condition: 'Equal' }
    ])
  })

  it('current behavior: only one leading/trailing star is stripped', () => {
    expect(parseFilterInput('**face**')).toEqual(single('*face*', 'Contains'))
  })

  it('current behavior: double negation keeps the second ! in the value', () => {
    expect(parseFilterInput('!!face')).toEqual(single('!face', 'NotEqual'))
  })

  it('current behavior: inner star is literal', () => {
    expect(parseFilterInput('fa*ce')).toEqual(single('fa*ce', 'Equal', false))
  })
})
