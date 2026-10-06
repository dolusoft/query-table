import { describe, expect, it } from 'vitest'

import {
  daysFromCivil,
  parseDate,
  parseDateTime,
  parseDateTimeRule,
  parseOffset
} from './temporal'

// Test oracles only: the code under test never calls Date.
const utc = (y: number, m: number, d = 1, h = 0, min = 0, s = 0, ms = 0) =>
  Date.UTC(y, m, d, h, min, s, ms)
const dayMs = 86_400_000
// 0001-01-01T00:00:00Z. Date.UTC maps the years 0-99 to 1900-1999, so the
// oracle sets the year on its own.
const yearOne = (() => {
  const date = new Date(0)
  date.setUTCFullYear(1, 0, 1)
  return date.getTime()
})()

describe('tr-1 time', () => {
  describe('daysFromCivil', () => {
    it('counts days from 1970-01-01', () => {
      expect(daysFromCivil(1970, 1, 1)).toBe(0)
      expect(daysFromCivil(2000, 3, 1)).toBe(11017)
      expect(daysFromCivil(1, 1, 1)).toBe(-719162)
      expect(daysFromCivil(9999, 12, 31)).toBe(2932896)
      expect(daysFromCivil(1969, 12, 31)).toBe(-1)
    })

    it('agrees with the proleptic Gregorian calendar', () => {
      expect(daysFromCivil(1, 1, 1) * dayMs).toBe(yearOne)
      const days: [number, number, number][] = [
        [1600, 2, 29],
        [1900, 2, 28],
        [1900, 3, 1],
        [2024, 2, 29],
        [2026, 10, 6],
        [1969, 1, 1],
        [9999, 12, 31]
      ]
      for (const [y, m, d] of days) {
        expect(daysFromCivil(y, m, d) * dayMs).toBe(utc(y, m - 1, d))
      }
    })
  })

  describe('parseOffset', () => {
    it('reads valid offsets in minutes', () => {
      expect(parseOffset('Z')).toBe(0)
      expect(parseOffset('+00:00')).toBe(0)
      expect(parseOffset('+03:00')).toBe(180)
      expect(parseOffset('-03:30')).toBe(-210)
      expect(parseOffset('+14:00')).toBe(840)
      expect(parseOffset('-14:00')).toBe(-840)
      expect(parseOffset('+13:59')).toBe(839)
    })

    it.each([
      '+14:01',
      '-14:01',
      '-00:00',
      '+15:00',
      '+03:60',
      '+3:00',
      '+0300',
      'z',
      '',
      ' +03:00',
      '+03:00 ',
      'UTC'
    ])('rejects %j', text => {
      expect(parseOffset(text)).toBeNull()
    })
  })

  describe('parseDate', () => {
    it('reads a valid day', () => {
      expect(parseDate('2000-02-29')).toBe(daysFromCivil(2000, 2, 29))
      expect(parseDate('1970-01-01')).toBe(0)
      expect(parseDate('0001-01-01')).toBe(-719162)
      expect(parseDate('9999-12-31')).toBe(2932896)
    })

    it.each([
      '2100-02-29',
      '2026-02-29',
      '0000-01-01',
      '1990-5-1',
      '2026-02-30',
      '2026-04-31',
      '2026-13-01',
      '2026-00-10',
      '2026-10-00',
      '2026-10-06T00:00:00Z',
      ' 2026-10-06',
      '2026-10-06 ',
      '2026-10-06\n',
      '+2026-10-06',
      '\uff12026-10-06',
      '\u0662026-10-06',
      2026,
      null,
      undefined,
      new Date(0)
    ])('rejects %j', text => {
      expect(parseDate(text)).toBeNull()
    })
  })

  describe('parseDateTime', () => {
    it('reads an instant with an offset', () => {
      const at = utc(2026, 9, 5, 21, 30)
      expect(parseDateTime('2026-10-06T00:30:00+03:00', null)).toEqual({
        ok: true,
        ms: at
      })
      expect(parseDateTime('2026-10-06 00:30:00+03:00', null)).toEqual({
        ok: true,
        ms: at
      })
      expect(parseDateTime('2026-10-05T07:30:00-14:00', null)).toEqual({
        ok: true,
        ms: at
      })
      expect(parseDateTime('2026-10-05T21:30:00+00:00', null)).toEqual({
        ok: true,
        ms: at
      })
      expect(parseDateTime('2026-10-06T00:30Z', null)).toEqual({
        ok: true,
        ms: utc(2026, 9, 6, 0, 30)
      })
    })

    it('pads and cuts the fraction to milliseconds in text', () => {
      const at = (frac: string) =>
        parseDateTime(`2026-10-06T23:59:59.${frac}+03:00`, null)
      const base = utc(2026, 9, 6, 20, 59, 59)
      expect(at('9999')).toEqual({ ok: true, ms: base + 999 })
      expect(at('999999999')).toEqual({ ok: true, ms: base + 999 })
      expect(at('5')).toEqual({ ok: true, ms: base + 500 })
      expect(at('05')).toEqual({ ok: true, ms: base + 50 })
      expect(at('0001')).toEqual({ ok: true, ms: base })
    })

    it('floors before the epoch', () => {
      expect(parseDateTime('1969-12-31T23:59:59.9999Z', null)).toEqual({
        ok: true,
        ms: -1
      })
      expect(parseDateTime('1969-12-31T23:59:59.999Z', null)).toEqual({
        ok: true,
        ms: -1
      })
      expect(parseDateTime('1969-12-31T23:59:59.5Z', null)).toEqual({
        ok: true,
        ms: -500
      })
      expect(parseDateTime('1970-01-01T00:00:00Z', null)).toEqual({
        ok: true,
        ms: 0
      })
    })

    it('accepts an instant that leaves the years 0001-9999 after the offset', () => {
      expect(parseDateTime('0001-01-01T00:00:00+14:00', null)).toEqual({
        ok: true,
        ms: yearOne - 840 * 60_000
      })
      expect(parseDateTime('9999-12-31T23:59:59.999-14:00', null)).toEqual({
        ok: true,
        ms: (daysFromCivil(9999, 12, 31) + 1) * dayMs - 1 + 840 * 60_000
      })
    })

    it('reads a value without an offset in the field offset', () => {
      const at = utc(2026, 9, 5, 21, 30)
      expect(parseDateTime('2026-10-06T00:30', 180)).toEqual({
        ok: true,
        ms: at
      })
      expect(parseDateTime('2026-10-06 00:30:00', 180)).toEqual({
        ok: true,
        ms: at
      })
    })

    it('never reinterprets an explicit offset', () => {
      expect(parseDateTime('2026-10-06T00:30:00Z', 180)).toEqual({
        ok: true,
        ms: utc(2026, 9, 6, 0, 30)
      })
    })

    it('needs an offset in the value or the field', () => {
      expect(parseDateTime('2026-10-06T00:30', null)).toEqual({
        ok: false,
        reason: 'no-offset'
      })
    })

    it.each([
      '2026-10-06T00:30:00+14:01',
      '2026-10-06T00:30:00-00:00',
      '2026-10-06t00:30:00Z',
      '2026-10-06T00:30:00z',
      '2026-10-06T00:30:00Z ',
      ' 2026-10-06T00:30:00Z',
      '2026-10-06  00:30:00Z',
      '2026-10-06\t00:30:00Z',
      '2026-10-06T24:00:00Z',
      '2026-10-06T23:60:00Z',
      '2026-10-06T23:59:60Z',
      '2026-10-06T0:30:00Z',
      '2026-10-06T00:30:00.Z',
      '2026-10-06T00:30:00.1234567890Z',
      '2026-10-06T00:30.5Z',
      '2026-02-30T00:30:00Z',
      '2100-02-29T00:00:00Z',
      '0000-01-01T00:00:00Z',
      '2026-10-06',
      '2026-10-06T00Z',
      '2026-10-06T00:30:00+03',
      '2026-10-06T00:30:00+0300',
      1_759_700_000_000,
      new Date(0),
      null
    ])('rejects %j as format', text => {
      expect(parseDateTime(text, 180)).toEqual({ ok: false, reason: 'format' })
      expect(parseDateTime(text, null)).toEqual({
        ok: false,
        reason: 'format'
      })
    })
  })

  describe('parseDateTimeRule', () => {
    it('reads a day as [start, end) in the field offset', () => {
      expect(parseDateTimeRule('2026-10-06', 180)).toEqual({
        ok: true,
        kind: 'day',
        start: utc(2026, 9, 5, 21),
        end: utc(2026, 9, 6, 21)
      })
      expect(parseDateTimeRule('1970-01-01', -60)).toEqual({
        ok: true,
        kind: 'day',
        start: 3_600_000,
        end: 3_600_000 + dayMs
      })
    })

    it('needs the field offset for a day', () => {
      expect(parseDateTimeRule('2026-10-06', null)).toEqual({
        ok: false,
        reason: 'no-offset'
      })
    })

    it('rejects an invalid day as format', () => {
      expect(parseDateTimeRule('2026-02-30', 180)).toEqual({
        ok: false,
        reason: 'format'
      })
      expect(parseDateTimeRule('2026-02-30', null)).toEqual({
        ok: false,
        reason: 'format'
      })
    })

    it('reads an instant like data does', () => {
      expect(parseDateTimeRule('2026-10-06T00:30:00+03:00', null)).toEqual({
        ok: true,
        kind: 'instant',
        ms: utc(2026, 9, 5, 21, 30)
      })
      expect(parseDateTimeRule('2026-10-06T00:30', 180)).toEqual({
        ok: true,
        kind: 'instant',
        ms: utc(2026, 9, 5, 21, 30)
      })
      expect(parseDateTimeRule('2026-10-06T00:30', null)).toEqual({
        ok: false,
        reason: 'no-offset'
      })
      expect(parseDateTimeRule('2026-10-06T24:00', 180)).toEqual({
        ok: false,
        reason: 'format'
      })
      expect(parseDateTimeRule(20261006, 180)).toEqual({
        ok: false,
        reason: 'format'
      })
    })
  })
})
