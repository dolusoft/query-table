// Text under the tr-1 profile (docs/guide/semantics.md#text). The unit is
// the UTF-16 code unit: every loop runs over an index with charCodeAt, never
// over code points, and every substring, prefix and equality is ordinal.

import { composePairs, letterOrder, sortFold, trimUnits } from './profile-tr-1'

const isHigh = (u: number) => u >= 0xd800 && u <= 0xdbff
const isLow = (u: number) => u >= 0xdc00 && u <= 0xdfff

/** No unpaired surrogate (malformed UTF-16 is rejected, not repaired). */
export const isWellFormed = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i)
    if (isHigh(u)) {
      if (i + 1 >= s.length || !isLow(s.charCodeAt(i + 1))) {
        return false
      }
      i++
    } else if (isLow(u)) {
      return false
    }
  }
  return true
}

/**
 * Composition C: left to right, a unit and the next one that form a pair of
 * the table become one unit, and the walk goes on after the pair (one pass,
 * no overlaps).
 */
export const compose = (s: string): string => {
  let out = ''
  let from = 0
  for (let i = 0; i + 1 < s.length; i++) {
    const to = composePairs.get(s.charCodeAt(i) * 0x10000 + s.charCodeAt(i + 1))
    if (to !== undefined) {
      out += s.slice(from, i) + String.fromCharCode(to)
      from = i + 2
      i++
    }
  }
  return from === 0 ? s : out + s.slice(from)
}

const sortFoldUnit = (u: number): number => {
  const folded = sortFold.get(u)
  if (folded !== undefined) {
    return folded
  }
  return u >= 0x41 && u <= 0x5a ? u + 0x20 : u
}

const matchFoldUnit = (u: number): number => {
  const folded = sortFoldUnit(u)
  return folded === 0x131 ? 0x69 : folded
}

// One unit to one unit, so the length never changes.
const mapUnits = (s: string, map: (u: number) => number): string => {
  let out = ''
  let from = 0
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i)
    const to = map(u)
    if (to !== u) {
      out += s.slice(from, i) + String.fromCharCode(to)
      from = i + 1
    }
  }
  return from === 0 ? s : out + s.slice(from)
}

/** Sort folding S: Turkish uppercase to lowercase (I → ı, İ → i). */
export const sortFoldText = (s: string): string => mapUnits(s, sortFoldUnit)

/** Match folding M: S, then ı → i, so I, ı, İ and i are one letter. */
export const matchFoldText = (s: string): string => mapUnits(s, matchFoldUnit)

/** The text a match condition and the search compare: M(C(s)). */
export const matchKey = (s: string): string => matchFoldText(compose(s))

// Built in a pure call, so a bundle that never compares text drops it.
const rank = /* @__PURE__ */ (() => {
  const map = new Map<number, number>()
  for (let i = 0; i < letterOrder.length; i++) {
    map.set(letterOrder.charCodeAt(i), i)
  }
  return map
})()

/**
 * Class << 16 | order inside the class (§4.4) of a folded unit. ASCII
 * capitals never reach here: folding has turned them into a-z (or ı), which
 * are letters of class 2.
 */
const weight = (u: number): number => {
  const letter = rank.get(u)
  if (letter !== undefined) {
    return (2 << 16) | letter
  }
  if (u >= 0x30 && u <= 0x39) {
    return (1 << 16) | u
  }
  if (u < 0x80) {
    return u
  }
  return (3 << 16) | u
}

/** Ordinal order of UTF-16 code units (String.CompareOrdinal). */
export const compareOrdinal = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0

/** The primary level of two folded texts: weight by weight, prefix first. */
const comparePrimary = (a: string, b: string): number => {
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const ua = a.charCodeAt(i)
    const ub = b.charCodeAt(i)
    if (ua !== ub) {
      const diff = weight(ua) - weight(ub)
      if (diff !== 0) {
        return diff
      }
    }
  }
  return a.length - b.length
}

/** A text decorated once per evaluation, for sorting many rows. */
export type SortKey = {
  /** S(C(s)), compared by class and order. */
  readonly primary: string
  /** C(s), compared ordinally when the primary level ties. */
  readonly tertiary: string
}

export const sortKey = (s: string): SortKey => {
  const tertiary = compose(s)
  return { primary: sortFoldText(tertiary), tertiary }
}

/** Same order as compareText, on decorated texts. */
export const compareSortKeys = (a: SortKey, b: SortKey): number =>
  comparePrimary(a.primary, b.primary) || compareOrdinal(a.tertiary, b.tertiary)

/**
 * The text order of tr-1 (§4.4): by class and order on S(C(·)), then
 * ordinal on C(·). A signed number, zero only when C(a) === C(b).
 */
export const compareText = (a: string, b: string): number =>
  compareSortKeys(sortKey(a), sortKey(b))

/** Trims the units of `trimUnits` from both ends of a search text. */
export const trimSearch = (s: string): string => {
  let start = 0
  let end = s.length
  while (start < end && trimUnits.has(s.charCodeAt(start))) {
    start++
  }
  while (end > start && trimUnits.has(s.charCodeAt(end - 1))) {
    end--
  }
  return start === 0 && end === s.length ? s : s.slice(start, end)
}
