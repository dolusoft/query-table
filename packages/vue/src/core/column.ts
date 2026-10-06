import type { Column, ColumnType } from '../contract'

const columnTypes: readonly ColumnType[] = [
  'string',
  'number',
  'integer',
  'date',
  'datetime',
  'bool'
]

/** Column type, lower-cased; anything unknown reads as `'string'`. */
export const columnTypeOf = (column: Column): ColumnType => {
  const type = column.type?.toLowerCase() as ColumnType | undefined
  return type && columnTypes.includes(type) ? type : 'string'
}

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
