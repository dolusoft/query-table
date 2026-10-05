import type { Component } from 'vue'

/**
 * Public contract of `VueServerTable`.
 *
 * Every type a consumer can touch lives in this file. The rendered component
 * is described by `TableProps`, `TableEmits`, `TableSlots` and
 * `VueServerTableExpose`; `CONTRACT.md` is generated from this file and from
 * the component, and `contract/rules.md` holds the behavior rules.
 */

/**
 * Comparison applied to a column. A column with no rule is not filtered, so
 * "no filter" is not a condition.
 */
export type FilterCondition =
  | 'Contains'
  | 'NotContains'
  | 'Equal'
  | 'NotEqual'
  | 'StartsWith'
  | 'EndsWith'
  | 'GreaterThan'
  | 'GreaterThanOrEqual'
  | 'LessThan'
  | 'LessThanOrEqual'
  | 'IsNull'
  | 'IsNotNull'

/** Conditions that take no value. Their rule always carries `value: null`. */
export type UnaryFilterCondition = 'IsNull' | 'IsNotNull'

/**
 * Value of a rule: text columns give a string, `number` and `integer` columns
 * a number, `date` and `datetime` columns a string, `bool` columns a boolean.
 */
export type FilterValue = string | number | boolean

/**
 * One clean filter rule. Operator shortcuts the user types (`*`, `!`, `,`) are
 * parsed by the table and never appear here.
 *
 * Several rules may share one `field` (the user typed `a,b`). They combine
 * with OR; when every rule of the field is negative (`NotEqual`,
 * `NotContains`) they combine with AND. Rules of different fields combine
 * with AND. The table does not evaluate rules, the server does.
 */
export interface FilterRule {
  /** Column `field` the rule applies to. */
  field: string
  condition: FilterCondition
  /** `null` for `IsNull` and `IsNotNull`; a non-empty value otherwise. */
  value: FilterValue | null
}

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  /** Column `field` the rows are ordered by. */
  field: string
  direction: SortDirection
}

/**
 * Everything the user can change about what the table shows. The consumer owns
 * it (`v-model:query`); the table only reads it and emits new objects.
 */
export interface TableQuery {
  /** 1-based page number. */
  page: number
  pageSize: number
  /** `null` means unsorted. */
  sort: SortState | null
  filters: FilterRule[]
}

/** What the user did to produce an `update:query` event. */
export type QueryChangeReason =
  'page' | 'pageSize' | 'sort' | 'filter' | 'reset'

/** Data type of a column; it picks the filter input and the default condition. */
export type ColumnType =
  'string' | 'number' | 'integer' | 'date' | 'datetime' | 'bool'

/**
 * Column definition. Pure data: the table never writes to these objects.
 * Extend it with your own fields (`interface MyColumn extends Column {}`).
 */
export interface Column {
  /**
   * Row property shown in the column. A dotted path (`'a.b'`) reads nested
   * values. The same string is used as `field` in `query.sort` and
   * `query.filters`.
   */
  field: string
  /** Header text. */
  title?: string
  /** Defaults to `'string'`. Case-insensitive at runtime. */
  type?: ColumnType
  /**
   * Header width, any CSS length. It is the only inline style the table ever
   * writes, and only when this is set.
   */
  width?: string
  /** Not rendered in the header or the body; its rules in `query` still apply. */
  hide?: boolean
  /** Show a filter input for this column (needs table `filterable`). Defaults to `true`. */
  filterable?: boolean
  /** Allow sorting by this column (needs table `sortable`). Defaults to `true`. */
  sortable?: boolean
  /** Render the cell with `v-html`. Escaping is the consumer's job. Defaults to `false`. */
  html?: boolean
}

/** One row of the totals block under the body. */
export interface FooterRow {
  cells: Array<{ field: string; text: string | number }>
}

export interface PaginationOptions {
  /** Offered page sizes, passed to the `pagination` slot. Defaults to `[10, 20, 30, 50, 100]`; `[]` offers none. */
  pageSizeOptions?: number[]
  /** Render the pagination block even when there are no rows and no total. Defaults to `false`. */
  alwaysShow?: boolean
}

export interface TableProps<T extends object = Record<string, unknown>> {
  /** The table state, used with `v-model:query`. Required: the table is always controlled. */
  query: TableQuery
  /** Column definitions. Never mutated. */
  columns: Column[]
  /** Rows of the current page, drawn exactly as given. */
  rows?: T[]
  /**
   * Total number of rows on the server, `null` when unknown. It only feeds
   * the `pagination` slot; it never decides whether rows are drawn.
   */
  totalRows?: number | null
  /** Rows of totals drawn in a `tfoot`. */
  footerRows?: FooterRow[]
  /** Sets `data-loading` and shows the `loader` slot. Defaults to `false`. */
  loading?: boolean
  /** Allow sorting from the headers (needs column `sortable`). Defaults to `false`. */
  sortable?: boolean
  /** Show the filter row. Defaults to `false`. */
  filterable?: boolean
  /** Milliseconds between the last key and the filter being applied. `0` applies on every keystroke. Defaults to `100`. */
  filterDebounce?: number
  /** `false` removes paging (no `page` or `pageSize` is ever emitted and the `pagination` slot is not drawn). Defaults to `true`. */
  pagination?: boolean | PaginationOptions
  /** Add a column with an expand button and render the `subtable` slot under expanded rows. Defaults to `false`. */
  hasSubtable?: boolean
  /** Add a column with a button that emits `rowRightPanelClick`. Defaults to `false`. */
  hasRightPanel?: boolean
  /**
   * Identity of a row for expansion state: a property name or a function.
   * Without it the row index is the identity and the state resets whenever
   * `rows` changes.
   */
  rowKey?: (keyof T & string) | ((row: T, index: number) => string | number)
  /** Cut long text to `truncateMaxLength` characters. Defaults to `true`. */
  truncate?: boolean
  /** Characters kept when `truncate` is on. Defaults to `150`. */
  truncateMaxLength?: number
}

/** Payload of the `cellContextMenu` event. */
export interface CellContextMenuPayload<T> {
  event: MouseEvent
  row: T
  /** The column definition the consumer passed. */
  column: Column
  /** Value of the cell (`field` read from `row`). */
  cellValue: unknown
  rowIndex: number
  /** Index into `columns`, hidden columns included. */
  columnIndex: number
}

/** Events of the table. */
export type TableEmits<T> = {
  /**
   * The user changed the query. `reason` says how. The query is a new object
   * with new `filters` and rule objects; apply it with `v-model:query`.
   */
  'update:query': [query: TableQuery, reason: QueryChangeReason]
  /** The right-panel button of a row was clicked. */
  rowRightPanelClick: [row: T]
  /** A cell was right-clicked. The browser menu is suppressed. */
  cellContextMenu: [payload: CellContextMenuPayload<T>]
}

export interface CellSlotProps<T> {
  row: T
  rowIndex: number
  column: Column
  cellValue: unknown
}

export interface SubtableSlotProps<T> {
  row: T
  rowIndex: number
}

export interface FilterDatetimeSlotProps {
  column: Column
  /** Text currently in the filter input. */
  value: string | undefined
  /** Replace the input text; the filter is applied after the debounce. */
  updateValue: (value: string) => void
}

/** One entry of the condition list offered for a column. */
export interface FilterConditionOption {
  value: FilterCondition
  /** English label, for example `'Starts With'`. */
  label: string
}

export interface FilterMenuSlotProps {
  column: Column
  /** Rules of this column currently in `query.filters`. */
  rules: FilterRule[]
  /** Condition shown for the column: the first rule's, else the one picked, else `null`. */
  condition: FilterCondition | null
  /** Conditions that make sense for the column type. */
  conditions: FilterConditionOption[]
  /**
   * Pick a condition. With a value typed (or `IsNull`/`IsNotNull`) the filter
   * is applied; otherwise the pick waits for a value. `null` clears the filter.
   */
  setCondition: (condition: FilterCondition | null) => void
  /** Remove the rules of this column. Sort is left alone. */
  clear: () => void
  /** Sorting by this column is possible (table and column `sortable`). */
  sortable: boolean
  /** Direction this column is sorted in, `null` when it is not the sorted one. */
  sortDirection: SortDirection | null
  /** Sort by this column. */
  setSort: (direction: SortDirection) => void
  /**
   * The filter button, as a component to place in your popover trigger:
   * `<PopoverTrigger as-child><trigger /></PopoverTrigger>`. It renders a
   * single `button.bh-filter-button` and merges the attributes it receives.
   */
  trigger: Component
}

export interface PaginationSlotProps {
  page: number
  pageSize: number
  /** `null` when `totalRows` is unknown. */
  pageCount: number | null
  totalRows: number | null
  pageSizeOptions: number[]
  canPrevious: boolean
  /** `page < pageCount` when the total is known, else `rows.length >= pageSize`. */
  canNext: boolean
  loading: boolean
  /** Go to a page; clamped to `[1, pageCount]` when the total is known. */
  setPage: (page: number) => void
  nextPage: () => void
  previousPage: () => void
  /** Change the page size and return to page 1 in one update. */
  setPageSize: (size: number) => void
}

/** Slots of the table. Slot names are kebab-case. */
export interface TableSlots<T> {
  /** Content above the table. */
  toolbar?(): unknown
  /** Replaces the date input of `date` and `datetime` filters. */
  'filter-datetime'?(props: FilterDatetimeSlotProps): unknown
  /** Content of the filter menu of a column; see `FilterMenuSlotProps`. Without it there is no filter button. */
  'filter-menu'?(props: FilterMenuSlotProps): unknown
  /** Content of an expanded row (needs `hasSubtable`). */
  subtable?(props: SubtableSlotProps<T>): unknown
  /** Shown while `loading`. */
  loader?(): unknown
  /** Shown when there are no rows and the table is not loading. */
  empty?(): unknown
  /** Paging controls. The block is drawn only when this slot is given. */
  pagination?(props: PaginationSlotProps): unknown
  /** Cell content for every column without a `cell-<field>` slot. */
  cell?(props: CellSlotProps<T>): unknown
  /** Cell content of one column: `cell-${column.field}`. */
  [key: `cell-${string}`]: ((props: CellSlotProps<T>) => unknown) | undefined
}

/** What a template ref to the table exposes. */
export interface VueServerTableExpose {
  /** Close every expanded row. */
  collapseAll(): void
  /**
   * Apply typed-but-not-yet-applied filter text now. Every `update:query` it
   * causes has been emitted when the call returns.
   */
  flushPendingFilters(): void
}
