// TanStack's broad table and column types. With `any` features a table
// shows every registered feature's options, state and APIs, the plugins'
// ones included (declaration merging). A feature hook receives a table that
// is generic over its features; `broad` is the one place it is widened.
import type { Column, Table } from '@tanstack/table-core'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
export type AnyTable = Table<any, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
export type AnyColumn = Column<any, any, any>

/** `table` as TanStack's broad table type. */
export const broad = (table: object): AnyTable => table as AnyTable
