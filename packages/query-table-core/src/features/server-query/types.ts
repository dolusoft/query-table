// The options and APIs serverQueryFeature adds to a TanStack table, registered
// through TanStack's declaration merging (spike/REPORT.md at fb3485b, finding 4): a table
// whose `features` hold `serverQueryFeature` takes `query` and
// `onQueryChange` as typed options and has `getBaseQuery()`.
import type {
  PageCursors,
  Query,
  QueryChangeReason
} from '@dolusoft/query-protocol'
import type { RowData, TableFeature, TableFeatures } from '@tanstack/table-core'

export interface ServerQueryOptions {
  /** The query the table shows. The consumer owns it (controlled). */
  query: Query
  /**
   * Called once per user action that changes the query, with a new object
   * and the reason (C-04, C-13). The table shows the change only once the
   * consumer passes the new query back.
   */
  onQueryChange: (query: Query, reason: QueryChangeReason) => void
  /**
   * Cursor mode: the cursors the server answered with for the page shown.
   * A step to the next or previous page asks for the cursor on that side
   * (C-56).
   */
  cursors?: PageCursors | null
  // The plugin owns `onSortingChange`, `onColumnFiltersChange`,
  // `onPaginationChange`, `onGlobalFilterChange`, the `manual*` flags,
  // `sortDescFirst` and `enableMultiSort` (C-61) and throws at construction
  // when the options replace them. They are not typed `never` here:
  // TanStack intersects every plugin's options into the `TableOptions_All`
  // that every feature's `getDefaultTableOptions` returns, so a `never`
  // would break every feature that sets those defaults, ours included.
}

export interface ServerQueryTableApi {
  /**
   * The query a new action builds on: the last update emitted in this tick
   * that the consumer has not answered yet, else the query shown (C-14).
   */
  getBaseQuery: () => Query
}

export interface ServerQueryColumnApi {
  /**
   * The header click (C-07): ascending, then descending, then unsorted,
   * starting from the column's direction in the base query. Unlike
   * TanStack's `toggleSorting()`, two calls in one tick give two steps.
   * Does nothing for a column that cannot sort.
   */
  toggleQuerySorting: () => void
}

// The merge targets and their type parameters must match TanStack's
// declarations exactly, so their names and unused parameters stay.
/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars */
declare module '@tanstack/table-core' {
  interface Plugins {
    serverQueryFeature: TableFeature
  }
  interface TableOptions_FeatureMap<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData
  > {
    serverQueryFeature: ServerQueryOptions
  }
  interface Table_FeatureMap<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData
  > {
    serverQueryFeature: ServerQueryTableApi
  }
  interface Column_FeatureMap<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData
  > {
    serverQueryFeature: ServerQueryColumnApi
  }
}
/* eslint-enable @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars */
