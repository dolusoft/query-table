import {
  cloneQuery,
  sameRules,
  searchOf,
  type FilterRule,
  type Query,
  type SortState
} from '@dolusoft/query-protocol'
import {
  applyQuery,
  slicePage,
  type Dataset,
  type LocalQueryError,
  type LocalQueryResult,
  type SemanticsProfile
} from '@dolusoft/query-protocol/local'
import {
  computed,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter
} from 'vue'

// Replaced by the consumer's bundler, just as in Vue's esm-bundler build.
declare const process: { env: { NODE_ENV?: string } }

export interface UseLocalQueryOptions<T> {
  /** Every row of the source context. Replace a shallowRef's array instead of mutating it. */
  allRows: MaybeRefOrGetter<readonly T[]>
  /** The consumer's query, read without writing or correcting it. */
  query: MaybeRefOrGetter<Query>
  /** Replace together with allRows when the schema changes. */
  dataset: MaybeRefOrGetter<Dataset<T>>
  profile: SemanticsProfile
  /** false returns every matching row for print or export. Defaults to true. */
  paginate?: MaybeRefOrGetter<boolean>
}

export interface LocalQuery<T> {
  /** The supplied row objects; empty while error is set. */
  rows: ComputedRef<T[]>
  /** The matching count; zero while error is set. */
  totalRows: ComputedRef<number>
  /** Render this separately from an empty result. */
  error: ComputedRef<LocalQueryError | null>
}

// A try/catch preserves constant replacement in production browser builds.
// A typeof guard would stay true when the browser has no process global.
const isDevelopment = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production'
  } catch {
    return true
  }
}

interface Semantic {
  filters: FilterRule[]
  sort: SortState | null
  search: string
}

/** Evaluates locally without rerunning filtering, search or sorting for a page-only change. */
export function useLocalQuery<T>(
  options: UseLocalQueryOptions<T>
): LocalQuery<T> {
  const semantic = computed<Semantic>(previous => {
    const query = toValue(options.query)
    // Include nested extra rule properties: sameRules compares them by value.
    const copy = cloneQuery({
      page: 1,
      pageSize: 1,
      filters: query.filters,
      sort: query.sort,
      search: searchOf(query)
    })
    const next = {
      filters: copy.filters,
      sort: copy.sort,
      search: searchOf(copy)
    }
    return previous &&
      sameRules(previous.filters, next.filters) &&
      previous.sort?.field === next.sort?.field &&
      previous.sort?.direction === next.sort?.direction &&
      (previous.sort === null) === (next.sort === null) &&
      previous.search === next.search
      ? previous
      : next
  })
  const evaluated = computed(() =>
    applyQuery(
      toValue(options.allRows),
      { page: 1, pageSize: 1, ...semantic.value },
      toValue(options.dataset),
      { profile: options.profile, paginate: false }
    )
  )
  const result = computed<LocalQueryResult<T>>(() => {
    const query = toValue(options.query)
    const paginate = toValue(options.paginate) ?? true
    const check = applyQuery([], query, toValue(options.dataset), {
      profile: options.profile,
      paginate
    })
    if (!check.ok) {
      return check
    }
    const all = evaluated.value
    if (!all.ok) {
      return all
    }
    if (!paginate) {
      return { ok: true, rows: [...all.rows], totalRows: all.totalRows }
    }
    // The precheck already validated paging.
    const page = slicePage(all.rows, query)
    return page.ok
      ? { ok: true, rows: page.rows, totalRows: all.totalRows }
      : page
  })
  const rows = computed(() => (result.value.ok ? result.value.rows : []))
  const totalRows = computed(() =>
    result.value.ok ? result.value.totalRows : 0
  )
  const error = computed(() => (result.value.ok ? null : result.value.error))
  let last = ''
  watch(
    error,
    value => {
      if (!value) {
        last = ''
        return
      }
      const key = JSON.stringify([value.code, value.path, value.field])
      if (isDevelopment() && key !== last) {
        last = key
        console.error('[useLocalQuery]', value)
      }
    },
    { immediate: true }
  )
  return { rows, totalRows, error }
}
