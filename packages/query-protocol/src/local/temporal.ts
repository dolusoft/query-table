// Dates and instants under the tr-1 profile (docs/guide/semantics.md#time).
// The grammar is checked field by field before any arithmetic, and the
// arithmetic is done by hand. The engine's UTC constructor maps the years
// 0-99 to 1900-1999 and rolls an invalid day into the next month; here no
// overflow can turn an invalid day into a valid one. An instant is UTC milliseconds, an
// integer that stays inside the safe range for the years 0001-9999.

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const dateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/
const offsetPattern = /^([+-])(\d{2}):(\d{2})$/
const dayMs = 86_400_000

/**
 * Days since 1970-01-01 in the proleptic Gregorian calendar (Howard
 * Hinnant's days_from_civil). Floors, so days before the epoch are negative.
 */
export const daysFromCivil = (y: number, m: number, d: number): number => {
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146_097 + doe - 719_468
}

const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)

const daysInMonth = (y: number, m: number) =>
  m === 2
    ? isLeap(y)
      ? 29
      : 28
    : m === 4 || m === 6 || m === 9 || m === 11
      ? 30
      : 31

/** The day number of valid calendar fields: year 0001-9999, real day. */
const dayOf = (y: string, m: string, d: string): number | null => {
  const year = Number(y)
  const month = Number(m)
  const date = Number(d)
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    date < 1 ||
    date > daysInMonth(year, month)
  ) {
    return null
  }
  return daysFromCivil(year, month, date)
}

/**
 * An offset in minutes: `Z`, or `±HH:MM` up to 14:00. `-00:00` is rejected
 * (in RFC 3339 it means "offset unknown"). The same grammar as the `offset`
 * setting of a field.
 */
export const parseOffset = (text: string): number | null => {
  if (text === 'Z') {
    return 0
  }
  const match = offsetPattern.exec(text)
  if (!match || text === '-00:00') {
    return null
  }
  const minutes = Number(match[2]) * 60 + Number(match[3])
  if (Number(match[3]) > 59 || minutes > 840) {
    return null
  }
  return match[1] === '-' ? -minutes : minutes
}

/** A `date` value: `YYYY-MM-DD` of a real day, as a day number. */
export const parseDate = (text: unknown): number | null => {
  if (typeof text !== 'string') {
    return null
  }
  const match = datePattern.exec(text)
  return match ? dayOf(match[1], match[2], match[3]) : null
}

export type DateTimeRead =
  { ok: true; ms: number } | { ok: false; reason: 'format' | 'no-offset' }

/**
 * A `datetime` value as UTC milliseconds. A value with an offset is read in
 * that offset, never reinterpreted; one without is read in `fieldOffset`
 * (minutes), or is `no-offset` when the field has none. The fraction is cut
 * in text to three digits, padded with zeros, then counted: no rounding,
 * and no truncation toward zero before the epoch.
 */
export const parseDateTime = (
  text: unknown,
  fieldOffset: number | null
): DateTimeRead => {
  if (typeof text !== 'string') {
    return { ok: false, reason: 'format' }
  }
  const match = dateTimePattern.exec(text)
  if (!match) {
    return { ok: false, reason: 'format' }
  }
  const [, y, mo, d, h, mi, s = '00', fraction = '', offsetText] = match
  const day = dayOf(y, mo, d)
  const hours = Number(h)
  const minutes = Number(mi)
  const seconds = Number(s)
  if (day === null || hours > 23 || minutes > 59 || seconds > 59) {
    return { ok: false, reason: 'format' }
  }
  let offset = fieldOffset
  if (offsetText !== undefined) {
    offset = parseOffset(offsetText)
    if (offset === null) {
      return { ok: false, reason: 'format' }
    }
  } else if (offset === null) {
    return { ok: false, reason: 'no-offset' }
  }
  const ms = Number((fraction + '00').slice(0, 3))
  return {
    ok: true,
    ms:
      day * dayMs +
      hours * 3_600_000 +
      minutes * 60_000 +
      seconds * 1000 +
      ms -
      offset * 60_000
  }
}

export type DayOrInstant =
  | { ok: true; kind: 'instant'; ms: number }
  | { ok: true; kind: 'day'; start: number; end: number }
  | { ok: false; reason: 'format' | 'no-offset' }

/**
 * The value of a rule on a `datetime` field: an instant as in
 * parseDateTime, or a bare day D, which needs `fieldOffset` and covers
 * [D 00:00 offset, D+1 00:00 offset).
 */
export const parseDateTimeRule = (
  text: unknown,
  fieldOffset: number | null
): DayOrInstant => {
  if (typeof text === 'string' && datePattern.test(text)) {
    const day = parseDate(text)
    if (day === null) {
      return { ok: false, reason: 'format' }
    }
    if (fieldOffset === null) {
      return { ok: false, reason: 'no-offset' }
    }
    const start = day * dayMs - fieldOffset * 60_000
    return { ok: true, kind: 'day', start, end: start + dayMs }
  }
  const read = parseDateTime(text, fieldOffset)
  return read.ok ? { ok: true, kind: 'instant', ms: read.ms } : read
}
