/** Pairs of objects being compared, to stop on a cycle. */
type Seen = Map<object, Set<object>>

/**
 * How deep the comparison goes before it tracks the pairs it opens. Plain
 * data is shallower than this and is compared without allocating; a cycle
 * goes deeper, and once tracked the first pair seen again ends it.
 */
const trackFrom = 32

const isPlainObject = (value: object): boolean => {
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** SameValueZero: `NaN` equals `NaN`, `0` equals `-0`. */
const sameZero = (a: unknown, b: unknown): boolean =>
  a === b || (Number.isNaN(a) && Number.isNaN(b))

const sameStructure = (
  a: object,
  b: object,
  depth: number,
  seen: Seen | null
): boolean => {
  if (depth >= trackFrom) {
    seen ??= new Map()
    const pairs = seen.get(a)
    if (pairs?.has(b)) {
      // A cycle: the pair is already being compared further up. Decide it
      // by reference, as for any value the comparison does not open.
      return false
    }
    if (pairs) {
      pairs.add(b)
    } else {
      seen.set(a, new Set([b]))
    }
  }
  try {
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) {
        return false
      }
      for (let index = 0; index < a.length; index++) {
        if (!compare(a[index], b[index], depth + 1, seen)) {
          return false
        }
      }
      return true
    }
    const keysA = Object.keys(a)
    if (keysA.length !== Object.keys(b).length) {
      return false
    }
    const recordA = a as Record<string, unknown>
    const recordB = b as Record<string, unknown>
    for (const key of keysA) {
      if (
        !Object.prototype.hasOwnProperty.call(b, key) ||
        !compare(recordA[key], recordB[key], depth + 1, seen)
      ) {
        return false
      }
    }
    return true
  } finally {
    seen?.get(a)?.delete(b)
  }
}

const compare = (
  a: unknown,
  b: unknown,
  depth: number,
  seen: Seen | null
): boolean => {
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
  return sameStructure(a, b, depth, seen)
}

/**
 * Equality of two cell values (C-92): primitives by SameValueZero (`NaN`
 * equals `NaN`, `0` equals `-0`, `null` is not `undefined`), dates by their
 * time, arrays item by item in order, plain objects by their keys in any
 * order; anything else (maps, sets, class instances, functions) and a
 * cycle by reference. Symmetric.
 */
export const sameValue = (a: unknown, b: unknown): boolean =>
  compare(a, b, 0, null)
