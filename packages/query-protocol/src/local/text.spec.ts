import { describe, expect, it } from 'vitest'

import { composePairs, letterOrder, sortFold, trimUnits } from './profile-tr-1'
import {
  compareOrdinal,
  compareSortKeys,
  compareText,
  compose,
  isWellFormed,
  matchFoldText,
  matchKey,
  sortFoldText,
  sortKey,
  trimSearch
} from './text'

const sign = (n: number) => Math.sign(n)
const sorted = (list: readonly string[]) => [...list].sort(compareText)

describe('tr-1 tables', () => {
  it('has the closed composition table of 11 pairs', () => {
    expect(composePairs.size).toBe(11)
  })

  it('folds I and the six Turkish uppercase letters outside ASCII', () => {
    expect(sortFold.size).toBe(7)
  })

  it('orders 32 distinct letters', () => {
    expect(letterOrder).toHaveLength(32)
    expect(new Set(letterOrder.split('')).size).toBe(32)
  })

  it('trims exactly U+0009-U+000D, U+0020 and U+00A0', () => {
    expect([...trimUnits].sort((a, b) => a - b)).toEqual([
      0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0
    ])
  })
})

describe('tr-1 text', () => {
  describe('isWellFormed', () => {
    it('rejects lone surrogates', () => {
      expect(isWellFormed('a\ud800')).toBe(false)
      expect(isWellFormed('\udc00')).toBe(false)
      expect(isWellFormed('\ud83d')).toBe(false)
      expect(isWellFormed('\ud83da')).toBe(false)
      expect(isWellFormed('\ude00\ud83d')).toBe(false)
    })

    it('accepts pairs and plain text', () => {
      expect(isWellFormed('\ud83d\ude00')).toBe(true)
      expect(isWellFormed('a\ud83d\ude00b')).toBe(true)
      expect(isWellFormed('')).toBe(true)
      expect(isWellFormed('\u0130stanbul')).toBe(true)
    })
  })

  describe('compose', () => {
    const pairs: [string, string][] = [
      ['I\u0307', '\u0130'],
      ['C\u0327', '\u00c7'],
      ['c\u0327', '\u00e7'],
      ['G\u0306', '\u011e'],
      ['g\u0306', '\u011f'],
      ['O\u0308', '\u00d6'],
      ['o\u0308', '\u00f6'],
      ['S\u0327', '\u015e'],
      ['s\u0327', '\u015f'],
      ['U\u0308', '\u00dc'],
      ['u\u0308', '\u00fc']
    ]

    it.each(pairs)('composes %j', (from, to) => {
      expect(compose(from)).toBe(to)
      expect(compose(`x${from}y`)).toBe(`x${to}y`)
    })

    it('leaves sequences outside the table alone', () => {
      expect(compose('i\u0307')).toBe('i\u0307')
      expect(compose('e\u0301')).toBe('e\u0301')
      expect(compose('\u0307I')).toBe('\u0307I')
      expect(compose('I\u0308')).toBe('I\u0308')
    })

    it('is a single pass', () => {
      expect(compose('I\u0307\u0307')).toBe('\u0130\u0307')
      expect(compose('S\u0327\u0327')).toBe('\u015e\u0327')
    })

    it('shortens the text', () => {
      const text = 'Is\u0327ik C\u0327ag\u0306'
      expect(compose(text)).toBe('I\u015fik \u00c7a\u011f')
      expect(compose(text)).toHaveLength(text.length - 3)
    })

    it('returns the text as is when nothing composes', () => {
      expect(compose('abc')).toBe('abc')
      expect(compose('')).toBe('')
      expect(compose('\u0307')).toBe('\u0307')
    })
  })

  describe('sortFoldText', () => {
    it('folds Turkish uppercase to lowercase', () => {
      expect(sortFoldText('I\u0130\u00c7\u011e\u00d6\u015e\u00dcAZ')).toBe(
        '\u0131i\u00e7\u011f\u00f6\u015f\u00fcaz'
      )
    })

    it('folds every ASCII capital but I by +0x20', () => {
      expect(sortFoldText('ABCDEFGHJKLMNOPQRSTUVWXYZ')).toBe(
        'abcdefghjklmnopqrstuvwxyz'
      )
    })

    it('leaves letters outside the profile alone', () => {
      expect(sortFoldText('\u00c2')).toBe('\u00c2')
      expect(sortFoldText('\u00c9')).toBe('\u00c9')
      expect(sortFoldText('\u0131i')).toBe('\u0131i')
    })

    it('keeps the length', () => {
      const text = '\u0130STANBUL Ankara 123 _~'
      expect(sortFoldText(text)).toHaveLength(text.length)
    })
  })

  describe('matchFoldText', () => {
    it('makes I, \u0131, \u0130 and i the same letter', () => {
      expect(matchFoldText('I\u0131\u0130i')).toBe('iiii')
    })

    it('equates s\u0131k and sik', () => {
      expect(matchFoldText('SIK')).toBe(matchFoldText('sik'))
      expect(matchFoldText('s\u0131k')).toBe('sik')
    })
  })

  describe('matchKey', () => {
    it('composes before folding', () => {
      expect(matchKey('I\u0307STANBUL')).toBe('istanbul')
      expect(matchKey('S\u0327ehir')).toBe('\u015fehir')
    })

    it('does not fold accents', () => {
      expect(matchKey('\u00e9')).not.toBe(matchKey('e'))
      expect(matchKey('\u00e7')).not.toBe(matchKey('c'))
    })
  })

  describe('compareText', () => {
    it('orders Turkish text (spec 4.4)', () => {
      const expected = [
        '50%_off',
        'Ankara',
        'I\u011eDIR',
        'I\u011fd\u0131r',
        '\u0131rmak',
        'Istanbul',
        'istanbul',
        '\u0130zmir'
      ]
      expect(sorted([...expected].reverse())).toEqual(expected)
    })

    it('breaks a primary tie by the ordinal order of the composed text (C44)', () => {
      expect(sorted(['ali', 'AL\u0130', 'Ali'])).toEqual([
        'AL\u0130',
        'Ali',
        'ali'
      ])
    })

    it('does not read numbers inside text (C36)', () => {
      expect(sign(compareText('dosya10', 'dosya2'))).toBe(-1)
      expect(sign(compareText('1072', '128'))).toBe(-1)
      expect(sorted(['9', '20', '128', '1072'])).toEqual([
        '1072',
        '128',
        '20',
        '9'
      ])
    })

    it('orders the classes and puts a prefix first (C49)', () => {
      const values = [
        'ab',
        'a',
        'a b',
        'a1',
        '\u00e9',
        'Z',
        '~',
        '\ud83d\ude00',
        '\u00e4',
        '1',
        '\u00c2',
        '\u00e2',
        '\uff41',
        '_'
      ]
      expect(sorted(values)).toEqual([
        '_',
        '~',
        '1',
        'a',
        'a b',
        'a1',
        'ab',
        'Z',
        '\u00c2',
        '\u00e2',
        '\u00e4',
        '\u00e9',
        '\ud83d\ude00',
        '\uff41'
      ])
    })

    it('is zero only for the same composed text', () => {
      expect(compareText('\u0130pek', 'I\u0307pek')).toBe(0)
      expect(compareText('', '')).toBe(0)
      expect(compareText('ipek', '\u0130pek')).not.toBe(0)
      expect(compareText('i\u0307', '\u0130')).not.toBe(0)
    })

    it('is antisymmetric', () => {
      const values = [
        'a',
        'A',
        '\u0131',
        'I',
        '\u0130',
        'i',
        '1',
        '_',
        '\u00e9',
        '',
        'I\u0307'
      ]
      for (const a of values) {
        for (const b of values) {
          expect(sign(compareText(a, b)) + sign(compareText(b, a))).toBe(0)
        }
      }
    })

    it('agrees with the sort keys', () => {
      const values = [
        '\u0130zmir',
        'Istanbul',
        'istanbul',
        '\u0131rmak',
        'AL\u0130',
        'Ali',
        'ali',
        'a b',
        '50%_off',
        '\ud83d\ude00',
        'I\u0307pek',
        '\u0130pek',
        ''
      ]
      for (const a of values) {
        for (const b of values) {
          expect(sign(compareSortKeys(sortKey(a), sortKey(b)))).toBe(
            sign(compareText(a, b))
          )
        }
      }
    })
  })

  describe('sortKey', () => {
    it('holds the folded and the composed text', () => {
      expect(sortKey('I\u0307STANBUL')).toEqual({
        primary: 'istanbul',
        tertiary: '\u0130STANBUL'
      })
    })
  })

  describe('compareOrdinal', () => {
    it('compares UTF-16 code units', () => {
      expect(['10', '2', '1'].sort(compareOrdinal)).toEqual(['1', '10', '2'])
      expect(sign(compareOrdinal('\uff41', '\ud83d\ude00'))).toBe(1)
      expect(compareOrdinal('\u00e9', 'e\u0301')).not.toBe(0)
      expect(compareOrdinal('a', 'a')).toBe(0)
      expect(sign(compareOrdinal('a', 'ab'))).toBe(-1)
    })
  })

  describe('trimSearch', () => {
    it('trims the listed units only', () => {
      expect(trimSearch('\t\u00a0stan\n')).toBe('stan')
      expect(trimSearch('\u2003ist')).toBe('\u2003ist')
      expect(trimSearch('\u000b\u000c\r a b \u00a0')).toBe('a b')
      expect(trimSearch(' \u00a0\t')).toBe('')
      expect(trimSearch('')).toBe('')
      expect(trimSearch('ab')).toBe('ab')
    })
  })
})
