// The type of a column, read case-insensitively (C-39), is the protocol's.
export { columnTypeOf } from '@dolusoft/query-protocol'

/** Reads a dotted path (`'a.b'`) from a row. */
export const valueAt = (row: object, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value === null || value === undefined
          ? undefined
          : (value as Record<string, unknown>)[key],
      row
    )
