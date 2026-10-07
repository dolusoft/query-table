// Helpers of the demo datasets: a fixed-seed generator and ISO date text.
// Every dataset builds its rows from its own seed, so a visit, a reload and
// a test all see the same rows.

/** A linear congruential generator: the same numbers for the same seed. */
export const seeded = (seed: number) => {
  let state = seed >>> 0
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  return {
    next,
    /** A whole number from `min` to `max`, both included. */
    int: (min: number, max: number) =>
      min + Math.floor(next() * (max - min + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** `YYYY-MM-DD` of a UTC timestamp. */
export const isoDate = (ms: number) => {
  const date = new Date(ms)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** `YYYY-MM-DDTHH:mm:ss` of a UTC timestamp, without a zone. */
export const isoDateTime = (ms: number) => {
  const date = new Date(ms)
  return `${isoDate(ms)}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

export const day = 86_400_000

export const round2 = (value: number) => Math.round(value * 100) / 100
