/** Pairs of objects being compared, to stop on a cycle. */
type Seen = Map<object, Set<object>>

const isPlainObject = (value: object): boolean => {
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** SameValueZero: `NaN` equals `NaN`, `0` equals `-0`. */
const sameZero = (a: unknown, b: unknown): boolean =>
  a === b || (Number.isNaN(a) && Number.isNaN(b))

const sameStructure = (a: object, b: object, seen: Seen): boolean => {
  const pairs = seen.get(a)
  if (pairs?.has(b)) {
    // A cycle: the pair is already being compared further up. Decide it by
    // reference, as for any value the comparison does not open.
    return false
  }
  if (pairs) {
    pairs.add(b)
  } else {
    seen.set(a, new Set([b]))
  }
  try {
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) {
        return false
      }
      return a.every((item, index) => compare(item, b[index], seen))
    }
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) {
      return false
    }
    const recordA = a as Record<string, unknown>
    const recordB = b as Record<string, unknown>
    return keysA.every(
      key =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        compare(recordA[key], recordB[key], seen)
    )
  } finally {
    seen.get(a)?.delete(b)
  }
}

const compare = (a: unknown, b: unknown, seen: Seen): boolean => {
  if (sameZero(a, b)) {
    return true
  }
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false
  }
  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date &&
      b instanceof Date &&
      sameZero(a.getTime(), b.getTime())
    )
  }
  const arrayA = Array.isArray(a)
  if (arrayA !== Array.isArray(b)) {
    return false
  }
  if (!arrayA && !(isPlainObject(a) && isPlainObject(b))) {
    // Maps, sets, class instances: by reference only.
    return false
  }
  return sameStructure(a, b, seen)
}

/**
 * Equality of two cell values (C-92): primitives by SameValueZero (`NaN`
 * equals `NaN`, `0` equals `-0`, `null` is not `undefined`), dates by their
 * time, arrays item by item in order, plain objects by their keys in any
 * order; anything else (maps, sets, class instances, functions) and a
 * cycle by reference. Symmetric.
 */
export const sameValue = (a: unknown, b: unknown): boolean =>
  compare(a, b, new Map())
