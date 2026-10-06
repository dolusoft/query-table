import { columnTypes } from '../protocol/constants'
import type { ColumnType, FilterColumn } from '../protocol/types'

/** Column type, lower-cased; anything unknown reads as `'string'`. */
export const columnTypeOf = (column: FilterColumn): ColumnType => {
  const type = column.type?.toLowerCase() as ColumnType | undefined
  return type && (columnTypes as readonly string[]).includes(type)
    ? type
    : 'string'
}
