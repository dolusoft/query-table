import type {
  ColumnType,
  FilterCondition,
  FilterRule,
  PageCursors,
  Query,
  QueryChangeReason,
  SortDirection,
  TableQuery
} from '@dolusoft/query-protocol'
import type { Component } from 'vue'

/**
 * Public contract of `QueryTable`.
 *
 * Every type a consumer can touch lives in this file. The rendered component
 * is described by `TableProps`, `TableEmits`, `TableSlots` and
 * `QueryTableExpose`; `CONTRACT.md` is generated from this file and from
 * the component, and `contract/rules.md` holds the behavior rules.
 */

/**
 * The query types are the protocol's (`@dolusoft/query-protocol`), exported
 * again so a consumer of the Vue package imports them from here, as in 2.2.x.
 */
export type {
  ColumnType,
  CursorQuery,
  CursorRequest,
  FilterCondition,
  FilterRule,
  FilterValue,
  PageCursors,
  Query,
  QueryChangeReason,
  SortDirection,
  SortState,
  TableQuery
} from '@dolusoft/query-protocol'

/**
 * Rows the user selected (`v-model:selection`), keyed by the row identity
 * (`rowKey`, as a string). Only `true` entries count.
 */
export type RowSelection = Record<string, boolean>

/**
 * Rows pinned to the top or the bottom of the page (`v-model:rowPinning`,
 * C-74): row keys (`rowKey` as a string) in the order they were pinned.
 */
export interface RowPinning {
  top: string[]
  bottom: string[]
}

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
   * Header width, any CSS length, written as the header cell's inline
   * `width`. A resizable column takes the pixel width of a `columnResize`
   * event back here (`${width}px`): the table keeps no width of its own.
   */
  width?: string
  /**
   * `'left'` draws the column before the others, `'right'` after them;
   * inside a side the order of `columns` holds. Their cells get
   * `data-pinned` and the measured offset. Sticky positioning is the
   * consumer's CSS.
   */
  pinned?: 'left' | 'right'
  /** Show a resize handle for this column (needs table `resizable`). Defaults to `true`. */
  resizable?: boolean
  /** Show a reorder handle for this column (needs table `reorderable`). Defaults to `true`. */
  reorderable?: boolean
  /**
   * Smallest width a resize gives, in pixels. Defaults to `40`. A value that
   * is not a finite number above `0` counts as unset.
   */
  minWidth?: number
  /**
   * Largest width a resize gives, in pixels. No limit by default. A value that
   * is not a finite number above `0` counts as unset; a `minWidth` above it wins.
   */
  maxWidth?: number
  /**
   * Not rendered in the header or the body; its rules in `query` still
   * apply. The table emits `update:columns` with `hide: true` when the user
   * hides it (`control.hide()`).
   */
  hide?: boolean
  /** Show a filter input for this column (needs table `filterable`). Defaults to `true`. */
  filterable?: boolean
  /** Allow sorting by this column (needs table `sortable`). Defaults to `true`. */
  sortable?: boolean
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

export interface TableProps<
  T extends object = Record<string, unknown>,
  Q extends Query = TableQuery
> {
  /**
   * The table state, used with `v-model:query`. Required: the table is
   * always controlled. A `CursorQuery` (a `cursor` key) pages by cursor.
   */
  query: Q
  /**
   * Cursor mode: the cursors of the page shown (C-56). The next and previous
   * page controls step to them; without the one on a side there is no page
   * on that side.
   */
  cursors?: PageCursors | null
  /**
   * Rows the user selected, used with `v-model:selection`. Given, a column
   * of checkboxes is drawn after the other utility columns; absent, there is
   * no selection. Keys are the row identity (`rowKey`) as a string.
   */
  selection?: RowSelection
  /**
   * Rows pinned to the top or the bottom of the page, used with
   * `v-model:rowPinning` (C-74). Keys are `rowKey` as a string; needs
   * `rowKey`. Keys of rows not in `rows` stay and are not drawn.
   */
  rowPinning?: RowPinning
  /**
   * Milliseconds between the last key of a search typed through the
   * `toolbar` slot and the search being applied (C-58). `0` applies every
   * call at once, for a consumer that debounces on its own. Defaults to `300`.
   */
  searchDebounce?: number
  /**
   * Column definitions, used with `v-model:columns` when the user may
   * change the layout. Never mutated.
   */
  columns: Column[]
  /**
   * Rows of the current page, drawn exactly as given.
   *
   * With `hasSubtable` a row may carry an optional `isExpanded` boolean to
   * seed its expansion state (for example a print or report view that opens
   * every row). Whenever `rows` changes, `isExpanded: true` opens the row,
   * `isExpanded: false` closes it, and a row without the field (or with any
   * other value) keeps what the state is. It is a seed, not a binding: the
   * table never writes it back, and the user's toggles stand until `rows`
   * changes again. The field is not part of `T`; it is read from the row
   * object as given.
   */
  rows?: T[]
  /**
   * Total number of rows on the server, `null` when unknown. It only feeds
   * the `pagination` slot; it never decides whether rows are drawn.
   */
  totalRows?: number | null
  /** Rows of totals drawn in a `tfoot`. */
  footerRows?: FooterRow[]
  /**
   * The consumer is fetching. The root gets `data-loading` and
   * `aria-busy="true"`, the rows given stay drawn, the empty state is not
   * shown and the `loading` slot is drawn as the last row of the body. The
   * table blocks no interaction. Defaults to `false`.
   */
  loading?: boolean
  /** Allow sorting from the headers (needs column `sortable`). Defaults to `false`. */
  sortable?: boolean
  /** Show the filter row. Defaults to `false`. */
  filterable?: boolean
  /**
   * Draw a resize handle in the header cells (needs column `resizable`).
   * Defaults to `false`. The table emits `columnResize`; the consumer writes
   * the width back to `Column.width`.
   */
  resizable?: boolean
  /**
   * Draw a reorder handle at the start of the header cells (needs column
   * `reorderable`): dragging it, or the arrow keys, Home and End on it, move
   * a column within its region and emit `update:columns`. Defaults to `false`.
   */
  reorderable?: boolean
  /** Milliseconds between the last key and the filter being applied. `0` applies on every keystroke. Defaults to `100`. */
  filterDebounce?: number
  /** Options of the `pagination` slot. Paging itself is always on. */
  pagination?: PaginationOptions
  /**
   * Add a column with an expand button and render the `subtable` slot under
   * expanded rows. A row can start expanded with its `isExpanded` field (see
   * `rows`). Defaults to `false`.
   */
  hasSubtable?: boolean
  /** Add a column with a button that emits `rowRightPanelClick`. Defaults to `false`. */
  hasRightPanel?: boolean
  /**
   * Identity of a row, for expansion state and for the rendered row (a row
   * keeps the state of its `subtable` components when `rows` reorder): a
   * property name or a function. A string is a direct property read, not a
   * dotted path; use the function form for a nested value. Keys must be
   * unique. Without it the row index is the identity and the expansion state
   * resets whenever `rows` changes.
   */
  rowKey?: (keyof T & string) | ((row: T, index: number) => string | number)
  /**
   * Text the table writes for people: accessible names and the options of a
   * bool filter. Give only the entries you want to change; the rest keep
   * their English defaults.
   */
  labels?: Partial<TableLabels>
}

/**
 * Every human-readable text the table renders itself. A function receives
 * the column name: its `title`, else its `field`.
 */
export interface TableLabels {
  /** Name and tooltip of the clear-all button. Default `'Clear all filters'`. */
  clearAllFilters: string
  /** Name of a row's expand button. Default `'Expand row'`. */
  expandRow: string
  /** Name of a row's right panel button. Default `'Open right panel'`. */
  openRightPanel: string
  /** Name of a filter input. Default `` name => `Filter ${name}` ``. */
  filterInput: (column: string) => string
  /** Name and tooltip of a filter button. Default `` name => `Filter options for ${name}` ``. */
  filterOptions: (column: string) => string
  /** Name of a column's resize handle. Default `` name => `Resize ${name}` ``. */
  resizeColumn: (column: string) => string
  /** Name of a column's reorder handle. Default `` name => `Move ${name}` ``. */
  moveColumn: (column: string) => string
  /** Bool filter option that removes the filter. Default `'All'`. */
  boolAll: string
  /** Bool filter option for `true`. Default `'True'`. */
  boolTrue: string
  /** Bool filter option for `false`. Default `'False'`. */
  boolFalse: string
  /** Name of a row's selection checkbox. Default `'Select row'`. */
  selectRow: string
  /** Name of the checkbox that selects every row of the page. Default `'Select all rows'`. */
  selectAllRows: string
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

/** Payload of the `columnResize` event. */
export interface ColumnResizePayload {
  /** `field` of the resized column. */
  field: string
  /** New width in whole pixels, within the column's `minWidth` and `maxWidth`. */
  width: number
}

/** What changed the layout in an `update:columns` event (C-68). */
export type ColumnChangeReason = 'visibility' | 'order' | 'pin' | 'resize'

/**
 * Column actions handed to the `header-<field>` and `filter-menu` slots
 * (C-70). Each action emits `update:columns`; the table changes nothing
 * until the consumer writes the new `columns` back.
 */
export interface ColumnControl {
  /** Side the column is pinned to, `false` when it is not pinned. */
  pinned: 'left' | 'right' | false
  /** Pin to a side or unpin: one `update:columns` with reason `pin`. */
  pin: (side: 'left' | 'right' | false) => void
  /** Hide the column: one `update:columns` with reason `visibility`. */
  hide: () => void
  /** There is a visible column on the left within the column's region. */
  canMoveLeft: boolean
  /** There is a visible column on the right within the column's region. */
  canMoveRight: boolean
  /**
   * Move one visible position within the region (C-69): one
   * `update:columns` with reason `order`; nothing at the region's edge.
   */
  move: (direction: 'left' | 'right') => void
}

/** Events of the table. */
export type TableEmits<T, Q extends Query = TableQuery> = {
  /**
   * The user changed the query. `reason` says how. The query is a new object
   * with new `filters` and rule objects; apply it with `v-model:query`.
   */
  'update:query': [query: Q, reason: QueryChangeReason]
  /**
   * The user changed the selection: a new object holding the `true` entries
   * (C-59). Apply it with `v-model:selection`.
   */
  'update:selection': [selection: RowSelection]
  /** The right-panel button of a row was clicked. */
  rowRightPanelClick: [row: T]
  /**
   * A cell was right-clicked. With a listener the browser menu is
   * suppressed; without one the table emits nothing and keeps it.
   */
  cellContextMenu: [payload: CellContextMenuPayload<T>]
  /**
   * The user resized a column: on release of a drag, on an arrow key or on
   * autofit. Write `width` back to the column (`Column.width`), or the column
   * keeps its old width.
   */
  columnResize: [payload: ColumnResizePayload]
  /**
   * The user changed the layout: visibility, order, pinning or a width
   * (C-68). A new array; changed columns are new objects, the others are
   * yours. Apply it with `v-model:columns`, or the table draws the old one.
   */
  'update:columns': [columns: Column[], reason: ColumnChangeReason]
  /**
   * The user pinned or unpinned a row (C-74): a new map. Apply it with
   * `v-model:rowPinning`, or the table draws the old order.
   */
  'update:rowPinning': [rowPinning: RowPinning]
}

export interface CellSlotProps<T> {
  row: T
  rowIndex: number
  column: Column
  cellValue: unknown
  /** Where the row is pinned (C-74): `'top'`, `'bottom'` or `false`. */
  rowPinned: 'top' | 'bottom' | false
  /**
   * Pin the row to the top or the bottom, or unpin it with `false`: one
   * `update:rowPinning`; nothing for the position the row has, and nothing
   * without `rowKey` and `rowPinning` (C-74).
   */
  pinRow: (position: 'top' | 'bottom' | false) => void
}

export interface HeaderSlotProps {
  column: Column
  /** Direction this column is sorted in, `null` when it is not the sorted one. */
  sortDirection: SortDirection | null
  /** Sorting by this column is possible (table and column `sortable`). */
  sortable: boolean
  /** Sort by this column as a header click does (C-07); does nothing when not `sortable`. */
  toggleSort: () => void
  /** Layout actions of this column (C-70). */
  control: ColumnControl
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
   * Pick a condition. With a value typed the filter is applied; otherwise the
   * pick waits for a value. `null` clears the filter.
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
   * single `button.qt-filter-button` and merges the attributes it receives.
   */
  trigger: Component
  /** Layout actions of this column (C-70). */
  control: ColumnControl
}

export interface ToolbarSlotProps {
  /** There is a filter rule or typed filter text to clear. */
  canClearFilters: boolean
  /** Remove every filter rule, the same as the clear-all button (C-22). */
  clearFilters: () => void
  /** Search text to show: the text being typed, else `query.search`, else `''`. */
  search: string
  /**
   * The search input changed: the text is applied after `searchDebounce`,
   * at once when it is `0` (C-58).
   */
  setSearch: (text: string) => void
  /** Apply a typed search now (Enter). Does nothing when nothing is pending. */
  applySearch: () => void
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
  /** Go to a page; clamped to `[1, pageCount]` when the total is known. */
  setPage: (page: number) => void
  nextPage: () => void
  previousPage: () => void
  /** Change the page size and return to page 1 in one update. */
  setPageSize: (size: number) => void
  /**
   * The query pages by cursor (C-56). There is no page number then: `page`
   * is `1`, `pageCount` is `null`, and `canPrevious` / `canNext` say whether
   * `cursors` hold a cursor on that side.
   */
  cursorMode: boolean
}

/** Slots of the table. Slot names are kebab-case. */
export interface TableSlots<T> {
  /** Content above the table. */
  toolbar?(props: ToolbarSlotProps): unknown
  /** Replaces the date input of `date` and `datetime` filters. */
  'filter-datetime'?(props: FilterDatetimeSlotProps): unknown
  /**
   * Content of the filter menu of a column; see `FilterMenuSlotProps`.
   * Without it there is no filter button. A `bool` column does not render it:
   * its select has no condition to pick.
   */
  'filter-menu'?(props: FilterMenuSlotProps): unknown
  /** Content of an expanded row (needs `hasSubtable`). */
  subtable?(props: SubtableSlotProps<T>): unknown
  /** Shown when there are no rows and `loading` is off. */
  empty?(): unknown
  /**
   * Drawn while `loading` is on, in a `tr.qt-loading-row` that is the last
   * row of the body. The rows stay; place the row over them in your CSS.
   */
  loading?(): unknown
  /** Paging controls. The block is drawn only when this slot is given. */
  pagination?(props: PaginationSlotProps): unknown
  /**
   * Header content of one column: `header-${column.field}`. It replaces the
   * sort button or the title only; the header cell, its filter row and its
   * resize handle stay. Draw a sort control with `toggleSort` if you want one.
   */
  [key: `header-${string}`]: ((props: HeaderSlotProps) => unknown) | undefined
  /** Cell content of one column: `cell-${column.field}`. */
  [key: `cell-${string}`]: ((props: CellSlotProps<T>) => unknown) | undefined
}

/** What a template ref to the table exposes. */
export interface QueryTableExpose {
  /** Close every expanded row. */
  collapseAll(): void
  /**
   * Open every row in `rows` (needs `hasSubtable`). Rows that arrive later
   * are not opened, and nothing is fetched.
   */
  expandAll(): void
  /**
   * Move focus to the filter of a column: its filter input, or the first
   * focusable element the `filter-datetime` slot draws. Returns `false` when
   * nothing took focus (no filter drawn for the field, a disabled select).
   */
  focusFilter(field: string): boolean
  /**
   * Apply typed-but-not-yet-applied filter text now, in one `update:query`
   * that has been emitted when the call returns.
   */
  flushPendingFilters(): void
}
