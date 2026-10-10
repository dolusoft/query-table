// useQueryTable (K4): the state of a Query Table without its markup. A
// TanStack table (`@tanstack/vue-table`) with the two plugins of
// `@dolusoft/query-table-core`, and the actions the parts of `QueryTable`
// call. `QueryTable` is built on it and holds no state logic of its own.
//
// The consumer owns every lasting value (P2): the query, the selection and
// the column layout (visibility, order, pinning, widths) arrive as options
// and changes leave as callbacks. The TanStack slices are projections of the
// query (ADR 0004) and of the columns (ADR 0007); what the table
// keeps is short-lived: typed filter and search text, and which rows are
// expanded (TanStack's `expanded` slice, P15).
import {
  columnTypeOf,
  type FilterDraft,
  isCursorQuery,
  type Query,
  searchOf
} from '@dolusoft/query-protocol'
import {
  dispose,
  type FilterLabel,
  filterInputFeature,
  projectServerQuery,
  serverQueryFeature
} from '@dolusoft/query-table-core'
import {
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnVisibilityFeature,
  functionalUpdate,
  globalFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowPinningFeature,
  rowSelectionFeature,
  rowSortingFeature,
  type Row,
  tableFeatures,
  type Updater,
  useTable,
  type VueTable
} from '@tanstack/vue-table'
import {
  computed,
  type ComputedRef,
  type MaybeRefOrGetter,
  onScopeDispose,
  shallowRef,
  toValue,
  watch
} from 'vue'

import {
  applyOrder,
  applyPinning,
  applyVisibility,
  moveField,
  sideOf
} from './columns/column-layout'
import type {
  Column,
  ColumnChangeReason,
  ColumnControl,
  FilterCondition,
  PageCursors,
  PaginationSlotProps,
  QueryChangeReason,
  RowPinning,
  RowSelection,
  SortDirection,
  TableProps,
  TableQuery
} from './contract'
import { valueAt } from './core/column'

/** The TanStack features of a Query Table, the two plugins included. */
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSelectionFeature,
  rowExpandingFeature,
  // K31-5: registered always; projections of `columns` (ADR 0007).
  columnVisibilityFeature,
  columnOrderingFeature,
  // D3: start = left, end = right; order and region only, offsets are
  // measured by the table, not computed from sizes.
  columnPinningFeature,
  // C-74: controlled by `rowPinning`; on only with `rowKey`.
  rowPinningFeature,
  serverQueryFeature,
  filterInputFeature
})

export type QueryTableFeatures = typeof features

/** Identity of a row: a property name or a function (see `TableProps.rowKey`). */
export type RowKey<T extends object> = TableProps<T>['rowKey']

export interface UseQueryTableOptions<
  T extends object,
  Q extends Query = TableQuery
> {
  /** The query the table shows. The consumer owns it. */
  query: MaybeRefOrGetter<Q>
  /** Column definitions, hidden ones included. Never mutated. */
  columns: MaybeRefOrGetter<Column[]>
  /** Rows of the current page. Defaults to none. */
  rows?: MaybeRefOrGetter<T[] | undefined>
  /** Rows on the server, `null` when unknown. */
  totalRows?: MaybeRefOrGetter<number | null | undefined>
  /** Cursor mode: the cursors of the page shown (C-56). */
  cursors?: MaybeRefOrGetter<PageCursors | null | undefined>
  /** Allow sorting (needs column `sortable`). Defaults to `false`. */
  sortable?: MaybeRefOrGetter<boolean | undefined>
  /** Milliseconds before typed filter text is applied. Defaults to `100`. */
  filterDebounce?: MaybeRefOrGetter<number | undefined>
  /** Milliseconds before typed search text is applied. Defaults to `300`. */
  searchDebounce?: MaybeRefOrGetter<number | undefined>
  /** The selected rows; `undefined` turns selection off. */
  selection?: MaybeRefOrGetter<RowSelection | undefined>
  /**
   * The pinned rows (C-74); `undefined`, or no `rowKey`, turns row pinning
   * off.
   */
  rowPinning?: MaybeRefOrGetter<RowPinning | undefined>
  /** Identity of a row. Without it the row index is the identity. */
  rowKey?: MaybeRefOrGetter<RowKey<T>>
  /** Rows can expand (the `subtable` column). Defaults to `false`. */
  hasSubtable?: MaybeRefOrGetter<boolean | undefined>
  /** Page sizes offered. Defaults to `[10, 20, 30, 50, 100]`. */
  pageSizeOptions?: MaybeRefOrGetter<number[] | undefined>
  /** Called once per user action that changes the query, with a new object. */
  onQueryChange: (query: Q, reason: QueryChangeReason) => void
  /** Called with the new selection (its `true` entries) when the user changes it. */
  onSelectionChange?: (selection: RowSelection) => void
  /**
   * Called once per user action that changes the layout, with a new array
   * (C-68).
   */
  onColumnsChange?: (columns: Column[], reason: ColumnChangeReason) => void
  /** Called with the new map when the user pins or unpins a row (C-74). */
  onRowPinningChange?: (rowPinning: RowPinning) => void
}

/** A row of the body in drawing order (C-74). */
export interface BodyRow<T> {
  row: T
  /** The row's index in `rows`. */
  index: number
  pinned: 'top' | 'bottom' | false
}

/** Row pinning (C-74), owned by the consumer. */
export interface QueryTableRowPinning<T extends object> {
  /** `rowPinning` and `rowKey` were given: rows can be pinned. */
  enabled: ComputedRef<boolean>
  /** The rows to draw: pinned to the top first, pinned to the bottom last. */
  rows: ComputedRef<BodyRow<T>[]>
  /**
   * Pin a row or unpin it (`false`): tells the consumer the new map; nothing
   * for the position the row has, or while row pinning is off.
   */
  pin: (row: T, index: number, position: 'top' | 'bottom' | false) => void
}

/** A column the table draws and its position in `columns`, hidden ones included. */
export interface ColumnEntry {
  column: Column
  index: number
}

/** The filter input of each column (C-08 to C-22). */
export interface QueryTableFilters {
  /** The column's typed text and picked condition; blank when nothing is typed. */
  draftOf: (field: string) => Readonly<FilterDraft>
  /** The input's text changed: applied after the debounce (C-09). */
  setInput: (field: string, text: string) => void
  /** Enter: applies the column's pending text now (C-12). */
  apply: (field: string) => void
  /** Applies every pending text in one update; `true` when it changed the filters. */
  flushAll: () => boolean
  /** Picks a condition; `null` clears the column (C-20). */
  setCondition: (field: string, condition: FilterCondition | null) => void
  /** Removes the column's rules and text (C-21). */
  clear: (field: string) => void
  /** Removes every rule and discards every text (C-22). */
  clearAll: () => void
  /** There is a rule or typed text to clear (C-22). */
  canClearAll: () => boolean
  /** The condition label under an input, `null` when there is none. */
  labelOf: (field: string) => FilterLabel | null
  /** How many rules a read-only input stands for; `0` when it is editable. */
  multiOf: (field: string) => number
}

/** Sorting by the headers and the filter menu (C-07). */
export interface QueryTableSort {
  /** The table and the column allow sorting by it. */
  isSortable: (column: Column) => boolean
  /** The direction the query sorts `column` in, `null` when it sorts another. */
  sortOf: (column: Column) => SortDirection | null
  /**
   * Without a direction, the header click: ascending, descending, none.
   * Does nothing for a column that cannot sort.
   */
  sortBy: (column: Column, direction?: SortDirection) => void
}

/** The global search (C-58). */
export interface QueryTableSearch {
  /** Text being typed, else `query.search`, else `''`. */
  text: ComputedRef<string>
  /** The input changed: applied after `searchDebounce`, at once when it is `0` or blank. */
  set: (text: string) => void
  /** Applies a pending text now; `true` when it emitted an update. */
  apply: () => boolean
}

/** Expanded rows (C-26, C-55), held in TanStack's `expanded` slice. */
export interface QueryTableExpansion<T extends object> {
  /** Identity of a row: `rowKey`, else its index. */
  keyOf: (row: T, index: number) => string | number
  isExpanded: (row: T, index: number) => boolean
  toggle: (row: T, index: number) => void
  collapseAll: () => void
  /** Opens every row given; nothing is fetched. */
  expandAll: () => void
}

/** Row selection (C-59), owned by the consumer. */
export interface QueryTableSelection<T extends object> {
  /** A `selection` was given: the table offers selection. */
  enabled: ComputedRef<boolean>
  isSelected: (row: T, index: number) => boolean
  toggle: (row: T, index: number) => void
  /** Every row of the page is selected (and there is one). */
  allSelected: ComputedRef<boolean>
  /** Some but not every row of the page is selected. */
  someSelected: ComputedRef<boolean>
  /** Select or deselect every row of the page. */
  toggleAll: (value: boolean) => void
}

/** The column layout actions (C-67 to C-70). */
export interface QueryTableLayout {
  /** What the `header-<field>` and `filter-menu` slots receive as `control`. */
  controlOf: (field: string) => ColumnControl
  /** The drawn columns of the field's region (left, center or right), in order. */
  regionOf: (field: string) => string[]
  /**
   * Puts `field` right before or after `target` in `columns` and emits the
   * order; nothing when `target` is not in the same region.
   */
  moveColumn: (field: string, target: string, place: 'before' | 'after') => void
}

export interface QueryTable<T extends object, Q extends Query = TableQuery> {
  /** The TanStack table, for the advanced path (headless markup). */
  table: VueTable<QueryTableFeatures, T>
  /**
   * The columns to draw: hidden ones dropped; pinned left first, pinned
   * right last (C-69).
   */
  columns: ComputedRef<ColumnEntry[]>
  /** Some drawn column is pinned to the left: the utility cells are pinned with it. */
  hasPinned: ComputedRef<boolean>
  /** Visibility, order and pinning actions (C-67 to C-70). */
  layout: QueryTableLayout
  sort: QueryTableSort
  filters: QueryTableFilters
  search: QueryTableSearch
  /** What the `pagination` slot receives (C-05, C-06, C-23, C-56). */
  pagination: ComputedRef<PaginationSlotProps>
  expansion: QueryTableExpansion<T>
  selection: QueryTableSelection<T>
  rowPinning: QueryTableRowPinning<T>
  /** The query a new action builds on (an update not yet answered included). */
  baseQuery: () => Q
}

const blank: Readonly<FilterDraft> = Object.freeze({
  text: '',
  condition: null
})

const defaultPageSizes = [10, 20, 30, 50, 100]

/** Only the `true` entries: the selection a consumer stores. */
const selectedOnly = (selection: RowSelection): RowSelection =>
  Object.fromEntries(Object.entries(selection).filter(([, value]) => value))

const noPinnedRows: RowPinning = Object.freeze({
  top: Object.freeze([]) as unknown as string[],
  bottom: Object.freeze([]) as unknown as string[]
})

const sameKeys = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key, i) => key === b[i])

/**
 * The state and actions of a server-side table: TanStack Table with
 * `serverQueryFeature` and `filterInputFeature`, in a Vue scope. Disposed
 * with the scope (C-62).
 */
export function useQueryTable<T extends object, Q extends Query = TableQuery>(
  options: UseQueryTableOptions<T, Q>
): QueryTable<T, Q> {
  const query = () => toValue(options.query)
  const rows = () => toValue(options.rows) ?? []
  const totalRows = () => toValue(options.totalRows) ?? null
  const cursors = () => toValue(options.cursors) ?? null
  const columns = () => toValue(options.columns)
  const rowKey = () => toValue(options.rowKey)
  const hasSubtable = () => toValue(options.hasSubtable) ?? false
  const pinnedRows = () => toValue(options.rowPinning)
  // C-74: without a row identity an index would pin another row on the next
  // page, so the map needs `rowKey`.
  const pinningEnabled = computed(
    () => rowKey() !== undefined && pinnedRows() !== undefined
  )
  const rowPinningState = computed(() => {
    if (!pinningEnabled.value) {
      return noPinnedRows
    }
    const map = pinnedRows()!
    return { top: map.top ?? [], bottom: map.bottom ?? [] }
  })

  const keyOf = (row: T, index: number): string | number => {
    const key = rowKey()
    if (typeof key === 'function') {
      return key(row, index)
    }
    if (typeof key === 'string') {
      return (row as Record<string, string | number>)[key]
    }
    return index
  }
  const idOf = (row: T, index: number) => String(keyOf(row, index))

  // The query as TanStack slices (ADR 0004).
  const projection = computed(() =>
    projectServerQuery({
      query: query(),
      rowCount: totalRows(),
      cursors: cursors(),
      pageRows: rows().length
    })
  )

  // Every column, hidden ones too: a filter of a hidden column still applies.
  const columnDefs = computed(() =>
    columns().map(column => ({
      id: column.field,
      accessorFn: (row: T) => valueAt(row, column.field),
      enableSorting: column.sortable !== false,
      filterType: columnTypeOf(column)
    }))
  )

  // The layout as TanStack slices (ADR 0007): visibility from `hide`, order
  // from the array, pinning from `pinned` (start = left, end = right).
  const columnVisibility = computed(() =>
    Object.fromEntries(columns().map(column => [column.field, !column.hide]))
  )
  const columnOrder = computed(() => columns().map(column => column.field))
  const columnPinning = computed(() => ({
    start: columns()
      .filter(column => sideOf(column) === 'left')
      .map(column => column.field),
    end: columns()
      .filter(column => sideOf(column) === 'right')
      .map(column => column.field)
  }))

  /** A layout change goes to the consumer; an equal result is no change (C-68). */
  const tell = (next: Column[] | null, reason: ColumnChangeReason) => {
    if (next) {
      options.onColumnsChange?.(next, reason)
    }
  }

  /** Updates emitted so far: tells whether an action emitted one. */
  let emits = 0

  const table = useTable<QueryTableFeatures, T>({
    features,
    columns: columnDefs,
    get data() {
      return rows()
    },
    getRowId: (row: T, index: number) => idOf(row, index),
    get query() {
      return query()
    },
    onQueryChange: (next: Query, reason: QueryChangeReason) => {
      emits += 1
      options.onQueryChange(next as Q, reason)
    },
    get cursors() {
      return cursors()
    },
    get rowCount() {
      return totalRows() ?? undefined
    },
    get pageCount() {
      return projection.value.pageCount
    },
    get enableSorting() {
      return toValue(options.sortable) ?? false
    },
    get filterDebounce() {
      return toValue(options.filterDebounce) ?? 100
    },
    enableRowSelection: true,
    // P15: the expansion is TanStack's; the table resets it itself (C-26).
    manualExpanding: true,
    getRowCanExpand: () => hasSubtable(),
    onRowSelectionChange: (updater: Updater<RowSelection>) => {
      const current = toValue(options.selection) ?? {}
      options.onSelectionChange?.(
        selectedOnly(functionalUpdate(updater, current))
      )
    },
    // C-68: the layout slices are controlled; a change becomes `columns`.
    onColumnVisibilityChange: (updater: Updater<Record<string, boolean>>) =>
      tell(
        applyVisibility(
          columns(),
          functionalUpdate(updater, columnVisibility.value)
        ),
        'visibility'
      ),
    onColumnOrderChange: (updater: Updater<string[]>) =>
      tell(
        applyOrder(columns(), functionalUpdate(updater, columnOrder.value)),
        'order'
      ),
    onColumnPinningChange: (
      updater: Updater<{ start?: string[]; end?: string[] }>
    ) =>
      tell(
        applyPinning(columns(), functionalUpdate(updater, columnPinning.value)),
        'pin'
      ),
    // C-74: the slice is controlled; a change is a new map for the consumer.
    get enableRowPinning() {
      return pinningEnabled.value
    },
    onRowPinningChange: (updater: Updater<RowPinning>) => {
      if (!pinningEnabled.value) {
        return
      }
      const current = rowPinningState.value
      const next = functionalUpdate(updater, current)
      if (
        !sameKeys(next.top, current.top) ||
        !sameKeys(next.bottom, current.bottom)
      ) {
        options.onRowPinningChange?.({
          top: [...next.top],
          bottom: [...next.bottom]
        })
      }
    },
    state: {
      get sorting() {
        return projection.value.state.sorting
      },
      get columnFilters() {
        return projection.value.state.columnFilters
      },
      get pagination() {
        return projection.value.state.pagination
      },
      get globalFilter() {
        return projection.value.state.globalFilter
      },
      get rowSelection() {
        return toValue(options.selection) ?? {}
      },
      get columnVisibility() {
        return columnVisibility.value
      },
      get columnOrder() {
        return columnOrder.value
      },
      get columnPinning() {
        return columnPinning.value
      },
      get rowPinning() {
        return rowPinningState.value
      }
    }
  } as never)

  onScopeDispose(() => dispose(table))

  const columnById = (field: string) =>
    table.getAllLeafColumns().find(column => column.id === field)

  // ---- columns -------------------------------------------------------------

  const entries = computed<ColumnEntry[]>(() => {
    const byField = new Map(
      columns().map((column, index) => [column.field, { column, index }])
    )
    return [
      ...table.getStartVisibleLeafColumns(),
      ...table.getCenterVisibleLeafColumns(),
      ...table.getEndVisibleLeafColumns()
    ]
      .map(column => byField.get(column.id))
      .filter((entry): entry is ColumnEntry => !!entry)
  })
  const hasPinned = computed(() =>
    entries.value.some(entry => sideOf(entry.column) === 'left')
  )

  // ---- layout (C-67 to C-70) -------------------------------------------------

  const regionOf = (field: string): string[] => {
    const own = entries.value.find(entry => entry.column.field === field)
    if (!own) {
      return []
    }
    const side = sideOf(own.column)
    return entries.value
      .filter(entry => sideOf(entry.column) === side)
      .map(entry => entry.column.field)
  }

  const moveColumn = (
    field: string,
    target: string,
    place: 'before' | 'after'
  ) => {
    if (field !== target && regionOf(field).includes(target)) {
      table.setColumnOrder(moveField(columnOrder.value, field, target, place))
    }
  }

  /**
   * A column's control. Every slot of every column gets one, so making it
   * does no work: `pinned`, `canMoveLeft` and `canMoveRight` read the layout
   * when they are read (a region is O(n)), and a slot that never reads them
   * costs nothing. A control kept past a re-render reads the current layout.
   */
  const controlOf = (field: string): ColumnControl => {
    const place = () => {
      const region = regionOf(field)
      return { at: region.indexOf(field), size: region.length }
    }
    return {
      get pinned() {
        const column = columns().find(candidate => candidate.field === field)
        return column ? sideOf(column) : false
      },
      pin: side =>
        columnById(field)?.pin(
          side === 'left' ? 'start' : side === 'right' ? 'end' : false
        ),
      hide: () => columnById(field)?.toggleVisibility(false),
      get canMoveLeft() {
        return place().at > 0
      },
      get canMoveRight() {
        const { at, size } = place()
        return at >= 0 && at < size - 1
      },
      // Read at call time, like the flags above.
      move: direction => {
        const current = regionOf(field)
        const from = current.indexOf(field)
        const target = current[from + (direction === 'left' ? -1 : 1)]
        if (from >= 0 && target !== undefined) {
          moveColumn(field, target, direction === 'left' ? 'before' : 'after')
        }
      }
    }
  }

  const layout: QueryTableLayout = { controlOf, regionOf, moveColumn }

  // ---- search (C-58) --------------------------------------------------------

  /** Typed and not yet answered; `null` when the input shows the query. */
  const typed = shallowRef<string | null>(null)
  let searchTimer: ReturnType<typeof setTimeout> | undefined

  const cancelSearch = () => {
    if (searchTimer !== undefined) {
      clearTimeout(searchTimer)
      searchTimer = undefined
    }
  }

  const applySearch = (): boolean => {
    const pending = searchTimer !== undefined
    cancelSearch()
    if (!pending || typed.value === null) {
      return false
    }
    const text = typed.value
    const before = emits
    table.setGlobalFilter(text)
    const emitted = emits !== before
    // Nothing to wait for: the text is no change, or the answer came already.
    if (!emitted || searchOf(query()) === text) {
      typed.value = null
    }
    return emitted
  }

  const setSearch = (text: string) => {
    typed.value = text
    cancelSearch()
    const wait = toValue(options.searchDebounce) ?? 300
    searchTimer = setTimeout(applySearch, Math.max(0, wait))
    if (wait <= 0 || text.trim() === '') {
      applySearch()
    }
  }

  // A new search text in the query replaces what was typed and applied.
  watch(
    () => searchOf(query()),
    () => {
      if (searchTimer === undefined) {
        typed.value = null
      }
    },
    { flush: 'sync' }
  )
  onScopeDispose(cancelSearch)

  const search: QueryTableSearch = {
    text: computed(() => typed.value ?? searchOf(query())),
    set: setSearch,
    apply: applySearch
  }

  // ---- filters --------------------------------------------------------------

  const draftOf = (field: string): Readonly<FilterDraft> =>
    columnById(field)?.getFilterInput() ?? blank

  const filters: QueryTableFilters = {
    draftOf,
    setInput: (field, text) => columnById(field)?.setFilterInput(text),
    apply: field => columnById(field)?.applyFilterInput(),
    flushAll: () => table.flushPendingFilters(),
    setCondition: (field, condition) =>
      columnById(field)?.setFilterCondition(condition),
    clear: field => columnById(field)?.clearFilterInput(),
    clearAll: () => table.clearAllFilters(),
    canClearAll: () => table.getCanClearAllFilters(),
    labelOf: field => columnById(field)?.getFilterLabel() ?? null,
    multiOf: field => draftOf(field).multi ?? 0
  }

  // ---- sort (C-07) ----------------------------------------------------------

  const isSortable = (column: Column) =>
    (toValue(options.sortable) ?? false) && column.sortable !== false

  const sort: QueryTableSort = {
    isSortable,
    sortOf: column => {
      const current = query().sort
      return current?.field === column.field ? current.direction : null
    },
    sortBy: (column, direction) => {
      const target = columnById(column.field)
      if (!isSortable(column) || !target) {
        return
      }
      applySearch()
      if (direction) {
        target.toggleSorting(direction === 'desc', false)
      } else {
        target.toggleQuerySorting()
      }
    }
  }

  // ---- pagination -----------------------------------------------------------

  const pageCountFor = (pageSize: number): number | null => {
    const total = totalRows()
    return total !== null && pageSize >= 1
      ? Math.max(1, Math.ceil(total / pageSize))
      : null
  }

  /** Page mode: there is a page after `base.page` (C-23). */
  const hasNext = (base: { page: number; pageSize: number }): boolean => {
    const count = pageCountFor(base.pageSize)
    return count !== null ? base.page < count : rows().length >= base.pageSize
  }

  const baseQuery = () => table.getBaseQuery() as Q

  /**
   * Applies pending search and filter text before a page action; `true`
   * when that changed the query, so the page asked for is dropped (C-14).
   */
  const flushBeforePage = () => {
    const searched = applySearch()
    const filtered = table.flushPendingFilters()
    return searched || filtered
  }

  const goTo = (page: number) => {
    table.setPagination(old => ({ ...old, pageIndex: page - 1 }))
  }

  const step = (by: 1 | -1) => {
    table.setPagination(old => ({ ...old, pageIndex: old.pageIndex + by }))
  }

  const setPage = (page: number) => {
    if (!Number.isFinite(page) || flushBeforePage()) {
      return
    }
    const base = baseQuery()
    if (isCursorQuery(base)) {
      return
    }
    const count = pageCountFor(base.pageSize)
    const target = Math.max(1, Math.trunc(page))
    goTo(count === null ? target : Math.min(target, count))
  }

  const nextPage = () => {
    if (flushBeforePage()) {
      return
    }
    const base = baseQuery()
    if (isCursorQuery(base)) {
      step(1)
    } else if (hasNext(base)) {
      goTo(base.page + 1)
    }
  }

  const previousPage = () => {
    if (flushBeforePage()) {
      return
    }
    const base = baseQuery()
    if (isCursorQuery(base)) {
      step(-1)
    } else {
      goTo(Math.max(1, base.page - 1))
    }
  }

  const setPageSize = (size: number) => {
    if (!Number.isInteger(size) || size < 1) {
      return
    }
    applySearch()
    table.flushPendingFilters()
    table.setPagination(old => ({ ...old, pageSize: size }))
  }

  const pagination = computed<PaginationSlotProps>(() => {
    const current = query()
    const cursorMode = isCursorQuery(current)
    const around = cursors()
    return {
      page: cursorMode ? 1 : current.page,
      pageSize: current.pageSize,
      pageCount: cursorMode ? null : pageCountFor(current.pageSize),
      totalRows: totalRows(),
      pageSizeOptions: toValue(options.pageSizeOptions) ?? defaultPageSizes,
      canPrevious: cursorMode ? !!around?.prev : current.page > 1,
      canNext: cursorMode ? !!around?.next : hasNext(current),
      setPage,
      nextPage,
      previousPage,
      setPageSize,
      cursorMode
    }
  })

  // ---- expansion (C-26, C-55) -----------------------------------------------

  // Vue computed around the atom: `atoms.*.get()` alone is not a tracked read
  // for every consumer path (TanStack vue-table: use a computed or Subscribe).
  const expandedState = computed(() => {
    const state = table.atoms.expanded.get()
    return state === true ? {} : state
  })
  const setExpanded = (
    update: (state: Record<string, boolean>) => Record<string, boolean>
  ) => {
    table.setExpanded(old => update(old === true ? {} : { ...old }))
  }

  const expansion: QueryTableExpansion<T> = {
    keyOf,
    isExpanded: (row, index) =>
      hasSubtable() && !!expandedState.value[idOf(row, index)],
    toggle: (row, index) => {
      const id = idOf(row, index)
      setExpanded(state => {
        if (state[id]) {
          delete state[id]
        } else {
          state[id] = true
        }
        return state
      })
    },
    collapseAll: () => table.setExpanded({}),
    expandAll: () => {
      if (hasSubtable()) {
        setExpanded(state => {
          rows().forEach((row, index) => {
            state[idOf(row, index)] = true
          })
          return state
        })
      }
    }
  }

  // Without a row identity the state belongs to the rows it was set on; with
  // one, only keys of the rows given stay, so it never grows past a page. A
  // row's `isExpanded` field seeds it each time `rows` changes (C-26).
  watch(
    rows,
    current => {
      setExpanded(state => {
        if (rowKey() === undefined) {
          state = {}
        } else {
          const present = new Set(current.map(idOf))
          for (const id of Object.keys(state)) {
            if (!present.has(id)) {
              delete state[id]
            }
          }
        }
        if (hasSubtable()) {
          current.forEach((row, index) => {
            const seeded = (row as { isExpanded?: unknown }).isExpanded
            if (seeded === true) {
              state[idOf(row, index)] = true
            } else if (seeded === false) {
              delete state[idOf(row, index)]
            }
          })
        }
        return state
      })
    },
    { immediate: true }
  )

  // ---- selection (C-59) -----------------------------------------------------

  const selection: QueryTableSelection<T> = {
    enabled: computed(() => toValue(options.selection) !== undefined),
    isSelected: (row, index) =>
      !!toValue(options.selection)?.[idOf(row, index)],
    toggle: (row, index) => {
      const id = idOf(row, index)
      table.setRowSelection(old => {
        const next = { ...old }
        if (next[id]) {
          delete next[id]
        } else {
          next[id] = true
        }
        return next
      })
    },
    allSelected: computed(() => table.getIsAllPageRowsSelected()),
    someSelected: computed(() => table.getIsSomePageRowsSelected()),
    toggleAll: value => table.toggleAllPageRowsSelected(value)
  }

  // ---- row pinning (C-74) ---------------------------------------------------

  const bodyRows = computed<BodyRow<T>[]>(() => {
    // Off: the rows as given, without TanStack's row model (the 3.0 path).
    if (!pinningEnabled.value) {
      return rows().map((row, index) => ({ row, index, pinned: false }))
    }
    const of = (
      row: Row<QueryTableFeatures, T>,
      pinned: BodyRow<T>['pinned']
    ): BodyRow<T> => ({ row: row.original, index: row.index, pinned })
    return [
      ...table.getTopRows().map(row => of(row, 'top')),
      ...table.getCenterRows().map(row => of(row, false)),
      ...table.getBottomRows().map(row => of(row, 'bottom'))
    ]
  })

  const positionOf = (id: string): BodyRow<T>['pinned'] => {
    const { top, bottom } = rowPinningState.value
    return top.includes(id) ? 'top' : bottom.includes(id) ? 'bottom' : false
  }

  const rowPinning: QueryTableRowPinning<T> = {
    enabled: pinningEnabled,
    rows: bodyRows,
    pin: (row, index, position) => {
      const id = idOf(row, index)
      // TanStack moves a row pinned again to the end of its region; the rule
      // is that the position the row has is no change.
      if (!pinningEnabled.value || positionOf(id) === position) {
        return
      }
      table.getRow(id, true)?.pin(position)
    }
  }

  return {
    table,
    columns: entries,
    hasPinned,
    layout,
    sort,
    filters,
    search,
    pagination,
    expansion,
    selection,
    rowPinning,
    baseQuery
  }
}
