// The options, state and APIs filterInputFeature adds to a TanStack table,
// registered through TanStack's declaration merging.
import type {
  ColumnType,
  FilterCondition,
  FilterDraft
} from '@dolusoft/query-protocol'
import type {
  CellData,
  RowData,
  TableFeature,
  TableFeatures
} from '@tanstack/table-core'

/** What the user has typed or picked per column `id`. */
export type FilterDrafts = Record<string, FilterDraft>

export interface FilterInputState {
  /**
   * Typed text and picked conditions. Short-lived input, not part of the
   * query: the table owns it and the query changes only when it is applied.
   */
  filterDrafts: FilterDrafts
}

export interface FilterInputOptions {
  /**
   * Milliseconds between the last keystroke and applying the text (C-09).
   * `0` applies every keystroke at once (C-12). Defaults to 100.
   */
  filterDebounce?: number
}

export interface FilterInputColumnDef {
  /**
   * The column's data type; it picks the filter grammar and the default
   * condition (C-15, C-16). Defaults to `'string'`.
   */
  filterType?: ColumnType
}

/** The condition label under an input. */
export interface FilterLabel {
  condition: FilterCondition
  /** How many rules the input stands for. */
  count: number
}

export interface FilterInputColumnApi {
  /** The column's draft; blank when nothing is typed. */
  getFilterInput: () => Readonly<FilterDraft>
  /**
   * The input's text changed: it is applied after the debounce (C-09), at
   * once when it is blank (C-11) or the debounce is 0 (C-12).
   */
  setFilterInput: (text: string) => void
  /** Enter: applies a pending text now (C-12). */
  applyFilterInput: () => void
  /** Picks a condition, `null` clears the column (C-20). */
  setFilterCondition: (condition: FilterCondition | null) => void
  /** Removes the column's rules and draft (C-21). */
  clearFilterInput: () => void
  /** The label under the input, `null` when there is nothing to label. */
  getFilterLabel: () => FilterLabel | null
}

export interface FilterInputTableApi {
  /**
   * Applies every pending text in one update (C-13). `true` when it changed
   * the filters.
   */
  flushPendingFilters: () => boolean
  /** Discards every draft and removes every rule (C-22). */
  clearAllFilters: () => void
  /** Whether there is a rule or a typed text to clear (C-22). */
  getCanClearAllFilters: () => boolean
}

// The merge targets and their type parameters must match TanStack's
// declarations exactly, so their names and unused parameters stay.
/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars */
declare module '@tanstack/table-core' {
  interface Plugins {
    filterInputFeature: TableFeature
  }
  interface TableState_FeatureMap {
    filterInputFeature: FilterInputState
  }
  interface TableOptions_FeatureMap<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData
  > {
    filterInputFeature: FilterInputOptions
  }
  interface Table_FeatureMap<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData
  > {
    filterInputFeature: FilterInputTableApi
  }
  interface Column_FeatureMap<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData
  > {
    filterInputFeature: FilterInputColumnApi
  }
  interface ColumnDef_FeatureMap<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData
  > {
    filterInputFeature: FilterInputColumnDef
  }
}
/* eslint-enable @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars */
