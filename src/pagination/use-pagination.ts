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
  props: Required<Pick<TableProps<object>, 'query' | 'rows'>> &
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

  /** Whether there is a page after `query.page` (C-23). */
  const hasNext = (query: TableQuery): boolean => {
    const count = pageCountFor(query.pageSize)
    return count !== null
      ? query.page < count
      : props.rows.length >= query.pageSize
  }

  const canNext = computed(() => hasNext(props.query))

  /** Emits the page change on the query an action builds on. */
  const goTo = (page: number) => {
    if (!Number.isFinite(page)) {
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

  // Each page action first applies a pending filter. A filter that changed the
  // filters moves the table to page 1: the page asked for belongs to the old
  // filters, so the click is dropped.
  const setPage = (page: number) => {
    if (Number.isFinite(page) && !options.flushFilters()) {
      goTo(page)
    }
  }

  const nextPage = () => {
    if (!options.flushFilters()) {
      const current = options.base()
      if (hasNext(current)) {
        goTo(current.page + 1)
      }
    }
  }

  const previousPage = () => {
    if (!options.flushFilters()) {
      goTo(options.base().page - 1)
    }
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
