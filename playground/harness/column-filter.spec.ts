import { describe, expect, test } from 'vitest'

import { commitDraft, draftFrom, isComposing, same } from './column-filter'
import type { Column, FilterRule } from '../../src/contract'

// The draft a compact filter sheet edits: built from the committed rules when
// it opens, turned back into rules (or kept, or refused) when it applies.

const city: Column = { field: 'city', title: 'City' }
const age: Column = { field: 'age', title: 'Age', type: 'integer' }
const born: Column = { field: 'born', title: 'Born', type: 'date' }
const active: Column = { field: 'active', title: 'Active', type: 'bool' }

const rule = (
  field: string,
  condition: FilterRule['condition'],
  value: FilterRule['value']
): FilterRule => ({ field, condition, value })

describe('draftFrom', () => {
  test('no rules: an empty draft with the default condition of the type', () => {
    expect(draftFrom(city, [])).toEqual({
      condition: 'Contains',
      text: '',
      summary: null
    })
    expect(draftFrom(age, [])).toEqual({
      condition: 'Equal',
      text: '',
      summary: null
    })
  })

  test('one rule that types back to itself is edited in the input', () => {
    const rules = [rule('age', 'GreaterThan', 30)]
    const draft = draftFrom(age, rules)
    expect(draft).toEqual({
      condition: 'GreaterThan',
      text: '30',
      summary: null
    })
    expect(commitDraft(age, draft)).toEqual({ kind: 'rules', rules })
  })

  test('several rules become a summary, and an empty input keeps them', () => {
    const rules = [rule('age', 'GreaterThan', 30), rule('age', 'LessThan', 20)]
    const draft = draftFrom(age, rules)
    expect(draft.text).toBe('')
    expect(draft.summary).toBe('Age greater than 30 or less than 20')
    expect(commitDraft(age, draft)).toEqual({ kind: 'keep' })
  })

  test('a value the grammar would read differently becomes a summary', () => {
    // `a*` typed back with Equal would come back as StartsWith.
    const rules = [rule('city', 'Equal', 'a*')]
    const draft = draftFrom(city, rules)
    expect(draft.summary).toBe('City equals a*')
    expect(commitDraft(city, draft)).toEqual({ kind: 'keep' })
  })

  test('a value typed over a summary replaces the rules', () => {
    const draft = {
      ...draftFrom(age, [rule('age', 'Equal', 1), rule('age', 'Equal', 2)]),
      text: '5'
    }
    expect(commitDraft(age, draft)).toEqual({
      kind: 'rules',
      rules: [rule('age', 'Equal', 5)]
    })
  })
})

describe('commitDraft', () => {
  test('an empty input without a summary clears the column', () => {
    expect(
      commitDraft(city, { condition: 'Contains', text: '  ', summary: null })
    ).toEqual({ kind: 'rules', rules: [] })
  })

  test('a date must be yyyy-mm-dd', () => {
    expect(
      commitDraft(born, { condition: 'Equal', text: '1/2/2020', summary: null })
    ).toEqual({ kind: 'error', message: 'Enter a date as yyyy-mm-dd.' })
    expect(
      commitDraft(born, {
        condition: 'GreaterThan',
        text: '2020-01-02',
        summary: null
      })
    ).toEqual({
      kind: 'rules',
      rules: [rule('born', 'GreaterThan', '2020-01-02')]
    })
  })

  test('a value the type cannot read is an error that names the type', () => {
    expect(
      commitDraft(age, { condition: 'Equal', text: 'abc', summary: null })
    ).toEqual({
      kind: 'error',
      message: 'Enter a whole number, for example 30.'
    })
  })

  test('a boolean draft becomes a boolean rule', () => {
    expect(
      commitDraft(active, { condition: 'Equal', text: 'true', summary: null })
    ).toEqual({ kind: 'rules', rules: [rule('active', 'Equal', true)] })
  })
})

describe('same', () => {
  test('compares condition and value, in order', () => {
    const a = [rule('age', 'Equal', 1), rule('age', 'Equal', 2)]
    expect(same(a, [rule('age', 'Equal', 1), rule('age', 'Equal', 2)])).toBe(
      true
    )
    expect(same(a, [...a].reverse())).toBe(false)
    expect(same(a, a.slice(0, 1))).toBe(false)
    expect(same([], [])).toBe(true)
  })
})

describe('isComposing', () => {
  const enter = (init: KeyboardEventInit & { keyCode?: number }) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', ...init })
    if (init.keyCode !== undefined) {
      Object.defineProperty(event, 'keyCode', { value: init.keyCode })
    }
    return event
  }

  test('an Enter while an input method composes does not apply', () => {
    expect(isComposing(enter({ isComposing: true }))).toBe(true)
    expect(isComposing(enter({ keyCode: 229 }))).toBe(true)
  })

  test('a plain Enter applies', () => {
    expect(isComposing(enter({ keyCode: 13 }))).toBe(false)
  })
})
