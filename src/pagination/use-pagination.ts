import { computed } from 'vue'

import type {
  PaginationSlotProps,
  QueryChangeReason,
  TableProps,
  TableQuery
} from '../contract'
import { cloneQuery } from '../core/query'

export interface PaginationInput {
  /** The props the table was given (read reactively). */
  props: Required<Pick<TableProps<object>, 'query' | 'rows' | 'loading'>> &
    Pick<TableProps<object>, 'totalRows' | 'pagination'>
  /** The query a new update must build on. */
  base: () => TableQuery
  update: (next: TableQuery, reason: QueryChangeReason) => void
  /** Applies pending filter drafts; `true` when they changed the filters. */
  flushFilters: () => boolean
  /** Whether the consumer gave the `pagination` slot. */
  hasSlot: () => boolean
}

/**
 * Page count and neighbours for the `pagination` slot, and the page actions it
 * calls. A page action first applies a pending filter; if that changed the
 * filters the action is dropped (C-14).
 */
export const usePagination = (options: PaginationInput) => {
  const { props } = options

  const paging = computed(() => ({
    pageSizeOptions: props.pagination?.pageSizeOptions ?? [10, 20, 30, 50, 100],
    alwaysShow: props.pagination?.alwaysShow ?? false
  }))

  const pageCountFor = (pageSize: number): number | null =>
    props.totalRows !== null && props.totalRows !== undefined && pageSize >= 1
      ? Math.max(1, Math.ceil(props.totalRows / pageSize))
      : null

  const pageCount = computed(() => pageCountFor(props.query.pageSize))

  const canNext = computed(() =>
    pageCount.value !== null
      ? props.query.page < pageCount.value
      : props.rows.length >= props.query.pageSize
  )

  const setPage = (page: number) => {
    if (!Number.isFinite(page)) {
      return
    }
    // A pending filter that changed the filters moves the table to page 1:
    // the page asked for belongs to the old filters, so the click is dropped.
    if (options.flushFilters()) {
      return
    }
    const current = options.base()
    const count = pageCountFor(current.pageSize)
    let target = Math.max(1, Math.trunc(page))
    if (count !== null) {
      target = Math.min(target, count)
    }
    options.update({ ...cloneQuery(current), page: target }, 'page')
  }

  const nextPage = () => {
    // See `setPage`: a pending filter that changed the filters ends the action.
    if (options.flushFilters()) {
      return
    }
    const current = options.base()
    const count = pageCountFor(current.pageSize)
    const canGo =
      count !== null
        ? current.page < count
        : props.rows.length >= current.pageSize
    if (canGo) {
      setPage(current.page + 1)
    }
  }

  const previousPage = () => {
    if (options.flushFilters()) {
      return
    }
    setPage(options.base().page - 1)
  }

  const setPageSize = (size: number) => {
    if (!Number.isInteger(size) || size < 1) {
      return
    }
    options.flushFilters()
    const current = options.base()
    if (size === current.pageSize) {
      return
    }
    options.update(
      { ...cloneQuery(current), page: 1, pageSize: size },
      'pageSize'
    )
  }

  const paginationProps = computed<PaginationSlotProps>(() => ({
    page: props.query.page,
    pageSize: props.query.pageSize,
    pageCount: pageCount.value,
    totalRows: props.totalRows ?? null,
    pageSizeOptions: paging.value.pageSizeOptions,
    canPrevious: props.query.page > 1,
    canNext: canNext.value,
    loading: props.loading,
    setPage,
    nextPage,
    previousPage,
    setPageSize
  }))

  const showPagination = computed(
    () =>
      options.hasSlot() &&
      (props.rows.length > 0 ||
        (props.totalRows ?? 0) > 0 ||
        paging.value.alwaysShow)
  )

  return { paginationProps, showPagination }
}
