// The tables of the tr-1 semantics profile (docs/guide/semantics.md). A
// profile never changes meaning: these tables are frozen with 3.1.0. Tables
// only, no logic; text.ts reads them. Every unit is a UTF-16 code unit.

// No side effects: a bundle that does not use the tables drops them.
const pair = /* @__NO_SIDE_EFFECTS__ */ (base: number, mark: number) =>
  base * 0x10000 + mark

/**
 * Composition table C: a base letter followed by a combining mark becomes one
 * unit. Closed on purpose: no Unicode normalization, so the table does not
 * depend on a runtime or a Unicode version. Key = base * 0x10000 + mark.
 */
export const composePairs: ReadonlyMap<number, number> = new Map([
  [pair(0x49, 0x307), 0x130],
  [pair(0x43, 0x327), 0xc7],
  [pair(0x63, 0x327), 0xe7],
  [pair(0x47, 0x306), 0x11e],
  [pair(0x67, 0x306), 0x11f],
  [pair(0x4f, 0x308), 0xd6],
  [pair(0x6f, 0x308), 0xf6],
  [pair(0x53, 0x327), 0x15e],
  [pair(0x73, 0x327), 0x15f],
  [pair(0x55, 0x308), 0xdc],
  [pair(0x75, 0x308), 0xfc]
])

/**
 * Sort folding S, the mappings that are not "ASCII capital + 0x20": I folds
 * to dotless ı, İ to i, and the five Turkish capitals outside ASCII to their
 * lowercase. The other ASCII capitals A-Z fold by + 0x20 in code.
 */
export const sortFold: ReadonlyMap<number, number> = new Map([
  [0x49, 0x131],
  [0x130, 0x69],
  [0xc7, 0xe7],
  [0x11e, 0x11f],
  [0xd6, 0xf6],
  [0x15e, 0x15f],
  [0xdc, 0xfc]
])

/** The 32 letters of class 2, in order (folded, so lowercase only). */
export const letterOrder =
  'abc\u00e7defg\u011fh\u0131ijklmno\u00f6pqrs\u015ftu\u00fcvwxyz'

/**
 * The units trimmed from search text: U+0009-U+000D, U+0020 and U+00A0. An
 * explicit list, since JS `trim()` and .NET `Trim()` use different sets.
 */
export const trimUnits: ReadonlySet<number> = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0
])
