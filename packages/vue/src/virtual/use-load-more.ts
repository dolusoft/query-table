import {
  isCursorQuery,
  type PageCursors,
  type Query
} from '@dolusoft/query-protocol'
import {
  computed,
  onBeforeUnmount,
  shallowRef,
  watch,
  watchEffect,
  type ShallowRef
} from 'vue'

import type { InfiniteOptions } from '../contract'

// Replaced by the consumer's bundler, just as in Vue's esm-bundler build.
declare const process: { env: { NODE_ENV?: string } }

export interface LoadMoreOptions {
  infinite: () => boolean | InfiniteOptions | undefined
  rowKey: () => unknown
  rows: () => readonly unknown[]
  query: () => Query
  totalRows: () => number | null
  cursors: () => PageCursors | null
  loading: () => boolean
  /** The next page action (C-05, C-56). */
  nextPage: () => void
  table: ShallowRef<HTMLTableElement | null>
  /** The body is virtual (C-83). */
  virtual: () => boolean
  /**
   * With `virtual`: the end of the drawn window among the center rows, and
   * their number; `null` until the window was laid out (C-83).
   */
  window: () => { end: number; count: number } | null
}

/**
 * Infinite scroll (C-88 to C-90): whether there is more to load, the
 * automatic request near the end of `rows` and `loadMore`. The rows are
 * the consumer's; the table only emits the next page action.
 */
export const useLoadMore = (o: LoadMoreOptions) => {
  const enabled = computed(() => !!o.infinite() && o.rowKey() !== undefined)
  const threshold = () => {
    const value = o.infinite()
    const given = typeof value === 'object' ? value.threshold : undefined
    return given !== undefined && given >= 0 ? Math.trunc(given) : 5
  }

  const canLoadMore = computed(() => {
    const query = o.query()
    if (isCursorQuery(query)) {
      return !!o.cursors()?.next
    }
    const total = o.totalRows()
    return total !== null
      ? query.page < Math.max(1, Math.ceil(total / query.pageSize))
      : o.rows().length >= query.page * query.pageSize
  })

  const loadMore = () => {
    if (enabled.value && canLoadMore.value && !o.loading()) {
      o.nextPage()
    }
  }

  // Without `virtual`: the row `threshold` rows before the last one, watched
  // in the viewport (the implicit root sees the clipping of every ancestor).
  const seen = shallowRef(false)
  let observer: IntersectionObserver | null = null
  watch(
    [enabled, o.virtual, o.rows, o.table],
    () => {
      observer?.disconnect()
      observer = null
      seen.value = false
      const count = o.rows().length
      const tbody = o.table.value?.tBodies[0]
      if (
        !enabled.value ||
        o.virtual() ||
        !tbody ||
        count === 0 ||
        typeof IntersectionObserver === 'undefined'
      ) {
        return
      }
      // Pinned rows (C-74) are drawn at the ends whatever their index: the
      // threshold row is counted among the others, from the last one.
      const others = tbody.querySelectorAll(
        ':scope > tr[data-row-index]:not([data-pinned-row])'
      )
      const target = others[Math.max(0, others.length - 1 - threshold())]
      if (target) {
        observer = new IntersectionObserver(entries => {
          seen.value = entries.some(entry => entry.isIntersecting)
        })
        observer.observe(target)
      }
    },
    { flush: 'post', immediate: true }
  )
  onBeforeUnmount(() => observer?.disconnect())

  // One automatic request per query and number of rows: an answer that
  // changes neither (an error) is not asked again (C-88).
  let asked = ''
  watchEffect(
    () => {
      if (!enabled.value || !canLoadMore.value || o.loading()) {
        return
      }
      const range = o.window()
      const near = o.virtual()
        ? range !== null && range.end >= range.count - threshold()
        : seen.value
      if (!near) {
        return
      }
      const signature = `${JSON.stringify(o.query())}#${o.rows().length}`
      if (signature !== asked) {
        asked = signature
        o.nextPage()
      }
    },
    { flush: 'post' }
  )

  let warned = false
  watchEffect(() => {
    if (!warned && o.infinite() && o.rowKey() === undefined) {
      warned = true
      try {
        if (process.env.NODE_ENV === 'production') {
          return
        }
      } catch {
        // No `process`: a development build.
      }
      console.warn(
        '[QueryTable] `infinite` needs `rowKey`; it is ignored without one (C-88).'
      )
    }
  })

  return { enabled, canLoadMore, loadMore }
}
